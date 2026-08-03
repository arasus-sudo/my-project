"""Azure Blob Storage for user-generated media (images, video, decks).

Why this exists: generated images were written as raw bytes into Mongo
documents and served back through `GET /api/carousel/image/{id}`. Both halves
of that are load-bearing problems.

  * Serving bytes through the app ties up a uvicorn worker for the whole
    transfer, and the deployment runs `--workers 1` (see the startup command in
    .github/workflows/azure-deploy.yml). A few concurrent media loads stall
    every other request — campaign sends, MCP calls, the API itself.
  * BSON documents cap at 16 MB, so video and decks cannot live there at all,
    and the working set of the images collection grows with the pixels rather
    than with the metadata.

The shape here is the standard one: private container, bytes go straight to
Blob, and the API only ever hands out short-lived signed URLs. Two upload
paths, because they have different failure modes:

  * `upload_bytes()` — server-side, for things the backend itself produced
    (AI-generated images) or small user uploads.
  * `write_sas_url()` — a direct-to-blob upload URL for the browser, for large
    media. Bytes never touch the app, which is the only way video uploads are
    safe on a single worker.

Every function degrades to a no-op when AZURE_STORAGE_CONNECTION_STRING is
unset, so a deployment without storage configured keeps working on the existing
Mongo path instead of failing.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

log = logging.getLogger(__name__)

AZURE_STORAGE_CONNECTION_STRING = os.environ.get("AZURE_STORAGE_CONNECTION_STRING", "")
BLOB_CONTAINER = os.environ.get("AZURE_BLOB_CONTAINER", "media")
BLOB_ENABLED = bool(AZURE_STORAGE_CONNECTION_STRING)

# Read URLs are minted per request rather than stored. An hour is long enough
# for a page to load and for a video to play through, short enough that a URL
# pasted elsewhere stops working. Never make the container public: these are
# customer assets, and a public container is world-readable forever.
READ_SAS_TTL_MINUTES = int(os.environ.get("AZURE_BLOB_READ_TTL_MINUTES", "60"))
# Upload URLs are single-purpose and short-lived by design.
WRITE_SAS_TTL_MINUTES = int(os.environ.get("AZURE_BLOB_WRITE_TTL_MINUTES", "15"))

# Longest edge of the generated thumbnail. Galleries render this, never the
# original — that is the whole point of the split.
THUMBNAIL_MAX_EDGE = 480

_account_name: Optional[str] = None
_account_key: Optional[str] = None


def _credentials() -> Tuple[Optional[str], Optional[str]]:
    """(account_name, account_key) parsed from the connection string.

    Parsed by hand rather than via the SDK because SAS signing needs the raw
    key, which the client object does not expose.
    """
    global _account_name, _account_key
    if _account_name is not None:
        return _account_name, _account_key
    parts = {}
    for chunk in AZURE_STORAGE_CONNECTION_STRING.split(";"):
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            parts[k.strip()] = v.strip()
    _account_name = parts.get("AccountName") or ""
    _account_key = parts.get("AccountKey") or ""
    return _account_name, _account_key


def blob_path(workspace_id: str, asset_id: str, filename: str) -> str:
    """Workspace-prefixed key.

    The workspace prefix is what makes tenant isolation and bulk cleanup a
    prefix operation instead of a scan.
    """
    safe = os.path.basename(filename or "file").replace("\\", "_").replace("..", "_")
    return f"{workspace_id}/{asset_id}/{safe}"


async def _client():
    """Async client — the sync SDK would block the event loop on every byte."""
    from azure.storage.blob.aio import BlobServiceClient
    return BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)


async def ensure_container() -> bool:
    """Create the private container if missing. Safe to call repeatedly."""
    if not BLOB_ENABLED:
        return False
    try:
        svc = await _client()
        async with svc:
            try:
                await svc.create_container(BLOB_CONTAINER)  # private by default
            except Exception:
                pass  # already exists
        return True
    except Exception as ex:
        log.warning("blob: ensure_container failed: %s", ex)
        return False


async def upload_bytes(path: str, data: bytes, content_type: str) -> bool:
    """Write bytes to `path`. Returns False rather than raising so callers can
    fall back to the legacy Mongo path instead of losing the asset."""
    if not BLOB_ENABLED:
        return False
    try:
        from azure.storage.blob import ContentSettings
        svc = await _client()
        async with svc:
            blob = svc.get_blob_client(container=BLOB_CONTAINER, blob=path)
            await blob.upload_blob(
                data, overwrite=True,
                content_settings=ContentSettings(content_type=content_type),
            )
        return True
    except Exception as ex:
        log.warning("blob: upload failed for %s: %s", path, ex)
        return False


def read_url(path: str, ttl_minutes: int = READ_SAS_TTL_MINUTES) -> str:
    """Short-lived read URL. Pure computation — no network call, so this is
    cheap enough to mint one per item on every gallery listing."""
    if not BLOB_ENABLED or not path:
        return ""
    try:
        from azure.storage.blob import BlobSasPermissions, generate_blob_sas
        name, key = _credentials()
        if not name or not key:
            return ""
        token = generate_blob_sas(
            account_name=name, account_key=key,
            container_name=BLOB_CONTAINER, blob_name=path,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
        )
        return f"https://{name}.blob.core.windows.net/{BLOB_CONTAINER}/{path}?{token}"
    except Exception as ex:
        log.warning("blob: read_url failed for %s: %s", path, ex)
        return ""


def write_sas_url(path: str, ttl_minutes: int = WRITE_SAS_TTL_MINUTES) -> str:
    """Direct-to-blob upload URL for the browser.

    `create` and `write` only — deliberately not `read` or `delete`, so a
    leaked upload URL cannot be used to enumerate or destroy anything.
    """
    if not BLOB_ENABLED or not path:
        return ""
    try:
        from azure.storage.blob import BlobSasPermissions, generate_blob_sas
        name, key = _credentials()
        if not name or not key:
            return ""
        token = generate_blob_sas(
            account_name=name, account_key=key,
            container_name=BLOB_CONTAINER, blob_name=path,
            permission=BlobSasPermissions(create=True, write=True),
            expiry=datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
        )
        return f"https://{name}.blob.core.windows.net/{BLOB_CONTAINER}/{path}?{token}"
    except Exception as ex:
        log.warning("blob: write_sas_url failed for %s: %s", path, ex)
        return ""


async def delete_blob(path: str) -> bool:
    if not BLOB_ENABLED or not path:
        return False
    try:
        svc = await _client()
        async with svc:
            await svc.get_blob_client(container=BLOB_CONTAINER, blob=path).delete_blob()
        return True
    except Exception as ex:
        log.info("blob: delete failed for %s (already gone?): %s", path, ex)
        return False


def make_thumbnail(data: bytes, max_edge: int = THUMBNAIL_MAX_EDGE) -> Optional[Tuple[bytes, str]]:
    """(bytes, content_type) for a downscaled preview, or None.

    Returns None for anything Pillow can't open — SVG, video, PPTX. Those get a
    thumbnail elsewhere or none at all; the caller must not treat it as an
    error. Always emits PNG so transparency survives.
    """
    try:
        import io

        from PIL import Image
        img = Image.open(io.BytesIO(data))
        img.thumbnail((max_edge, max_edge))
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), "image/png"
    except Exception as ex:
        log.info("blob: thumbnail skipped (%s)", ex)
        return None


def asset_urls(doc: Dict[str, Any]) -> Dict[str, str]:
    """Signed URLs for an asset document, empty when it predates blob storage."""
    return {
        "url": read_url(doc.get("blob_path", "")),
        "thumb_url": read_url(doc.get("thumb_path", "")) or read_url(doc.get("blob_path", "")),
    }
