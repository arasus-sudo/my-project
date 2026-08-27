"""Knowledge — one shared, permission-aware company knowledge base.

Every agent grounds on this instead of keeping its own silo (Site EQ and
WhatsApp EQ each grew their own chunk stores before this existed; both are
backfillable here). Retrieval is embeddings-first via OpenAI when a key is
present, with an honest text-regex fallback so the whole flow stays demoable
without credentials — the suite's standard mocked-first convention.

v1 scope: manual ingestion (paste/upload text), backfill from the two legacy
chunk stores, cosine-over-filtered-candidates search. At SMB scale (tens of
thousands of chunks) Python-side cosine over a workspace filter is fast
enough; swapping to Atlas Vector Search / pgvector later changes nothing
above kb_search().
"""

import math
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import db, current_user, now_iso, new_id, _audit

kb_router = APIRouter(prefix="/kb")

EMBEDDINGS_MODEL = os.environ.get("EMBEDDINGS_MODEL", "text-embedding-3-small")
EMBED_DIM = 1536          # text-embedding-3-small dimensionality
CHUNK_CHARS = 1200        # ~300 tokens per chunk
CHUNK_OVERLAP = 150
MAX_CHUNKS_PER_DOC = 200


# ----------------------------- Embeddings --------------------------------------
async def _embed_texts(texts: List[str]) -> Optional[List[List[float]]]:
    """Batch-embed texts. Returns None when no key is configured (mocked mode) —
    callers store chunks without vectors and search falls back to text match."""
    from server import OPENAI_API_KEY
    if not OPENAI_API_KEY or not texts:
        return None
    try:
        import openai
        client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
        resp = await client.embeddings.create(model=EMBEDDINGS_MODEL, input=texts)
        return [d.embedding for d in resp.data]
    except Exception:
        return None


def _cosine(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1e-9
    nb = math.sqrt(sum(y * y for y in b)) or 1e-9
    return dot / (na * nb)


def chunk_text(text: str) -> List[str]:
    """Paragraph-aware sliding window: ~CHUNK_CHARS with overlap. Pure function."""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= CHUNK_CHARS:
        return [text]
    paragraphs = re.split(r"\n\s*\n", text)
    chunks: List[str] = []
    buf = ""
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        while len(p) > CHUNK_CHARS:               # pathological single paragraph
            chunks.append(p[:CHUNK_CHARS])
            p = p[CHUNK_CHARS - CHUNK_OVERLAP:]
        if len(buf) + len(p) + 2 <= CHUNK_CHARS:
            buf = f"{buf}\n\n{p}" if buf else p
        else:
            if buf:
                chunks.append(buf)
            tail = buf[-CHUNK_OVERLAP:] if buf else ""
            buf = f"{tail}\n\n{p}" if tail else p
    if buf.strip():
        chunks.append(buf.strip())
    return chunks


# ----------------------------- Models ------------------------------------------
class DocumentIn(BaseModel):
    title: str
    text: str
    source: str = "manual"       # manual | site | whatsapp | note | proposal | upload
    uri: Optional[str] = None


class SearchIn(BaseModel):
    query: str
    k: int = 5


# ----------------------------- Ingestion ---------------------------------------
async def ingest_document(workspace_id: str, body: DocumentIn) -> Dict[str, Any]:
    title = (body.title or "").strip()
    text = (body.text or "").strip()
    if not title or not text:
        raise HTTPException(400, "title and text are required")
    doc = {
        "id": new_id(), "workspace_id": workspace_id,
        "title": title[:200], "source": body.source or "manual",
        "uri": (body.uri or "").strip()[:500] or None,
        "chars": len(text),
        "created_at": now_iso(),
    }
    await db.kb_docs.insert_one(doc)

    pieces = chunk_text(text)[:MAX_CHUNKS_PER_DOC]
    embeddings = await _embed_texts(pieces)
    chunks = []
    for i, piece in enumerate(pieces):
        c: Dict[str, Any] = {
            "id": new_id(), "workspace_id": workspace_id, "doc_id": doc["id"],
            "chunk_idx": i, "text": piece,
            "has_embedding": bool(embeddings), "created_at": now_iso(),
        }
        if embeddings:
            c["embedding"] = embeddings[i]
        chunks.append(c)
    if chunks:
        await db.kb_chunks.insert_many(chunks)
    doc["chunks"] = len(chunks)
    doc["embedded"] = bool(embeddings)
    return doc


# ----------------------------- Search ------------------------------------------
async def kb_search(workspace_id: str, query: str, k: int = 5) -> Dict[str, Any]:
    """Embeddings-first retrieval with regex fallback. Returns matches joined
    with their document titles so callers can cite sources."""
    query = (query or "").strip()
    if not query:
        raise HTTPException(400, "query is required")
    k = max(1, min(int(k or 5), 20))

    qvec = await _embed_texts([query])
    matches: List[Dict[str, Any]] = []
    if qvec:
        # Candidate cap keeps Python-side cosine honest at large volumes.
        cursor = db.kb_chunks.find(
            {"workspace_id": workspace_id, "has_embedding": True},
            {"_id": 0, "id": 1, "doc_id": 1, "text": 1, "embedding": 1},
        ).limit(5000)
        scored = []
        async for c in cursor:
            scored.append((_cosine(qvec[0], c["embedding"]), c))
        scored.sort(key=lambda t: -t[0])
        for score, c in scored[:k]:
            matches.append({"score": round(score, 4), "text": c["text"], "doc_id": c["doc_id"]})
        mode = "vector"
    else:
        rx = {"$regex": re.escape(query), "$options": "i"}
        cursor = db.kb_chunks.find(
            {"workspace_id": workspace_id, "text": rx},
            {"_id": 0, "id": 1, "doc_id": 1, "text": 1},
        ).limit(k)
        async for c in cursor:
            matches.append({"score": None, "text": c["text"], "doc_id": c["doc_id"]})
        mode = "text-fallback"

    doc_ids = list({m["doc_id"] for m in matches})
    titles = {d["id"]: d.get("title") for d in await db.kb_docs.find(
        {"id": {"$in": doc_ids}}, {"_id": 0, "id": 1, "title": 1}).to_list(len(doc_ids))}
    for m in matches:
        m["title"] = titles.get(m["doc_id"])
    return {"query": query, "mode": mode, "matches": matches}


# ----------------------------- Routes ------------------------------------------
@kb_router.post("/documents")
async def create_document(body: DocumentIn, user=Depends(current_user)):
    doc = await ingest_document(user["workspace_id"], body)
    await _audit(user, "kb.document_ingested",
                 {"doc_id": doc["id"], "chunks": doc["chunks"], "embedded": doc["embedded"]})
    return doc


@kb_router.get("/documents")
async def list_documents(source: Optional[str] = None, user=Depends(current_user)):
    q: Dict[str, Any] = {"workspace_id": user["workspace_id"]}
    if source:
        q["source"] = source
    docs = await db.kb_docs.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    counts: Dict[str, int] = {}
    async for row in db.kb_chunks.find(
        {"workspace_id": user["workspace_id"], "doc_id": {"$in": [d["id"] for d in docs]}},
        {"_id": 0, "doc_id": 1},
    ):
        counts[row["doc_id"]] = counts.get(row["doc_id"], 0) + 1
    for d in docs:
        d["chunk_count"] = counts.get(d["id"], 0)
    return docs


@kb_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user=Depends(current_user)):
    r = await db.kb_docs.delete_one({"id": doc_id, "workspace_id": user["workspace_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "not found")
    await db.kb_chunks.delete_many({"doc_id": doc_id, "workspace_id": user["workspace_id"]})
    await _audit(user, "kb.document_deleted", {"doc_id": doc_id})
    return {"ok": True}


@kb_router.post("/search")
async def search(body: SearchIn, user=Depends(current_user)):
    """Free by principle: reading your own knowledge is never metered."""
    return await kb_search(user["workspace_id"], body.query, body.k)


@kb_router.post("/backfill")
async def backfill_from_legacy(user=Depends(current_user)):
    """Pull Site EQ + WhatsApp EQ chunk stores into the shared KB (skipping
    anything already ingested — safe to run repeatedly until the count stops
    changing). Idempotent by (source, uri/title) dedupe on the doc level."""
    wid = user["workspace_id"]
    created_docs, created_chunks = 0, 0
    for legacy_col, source in (("site_kb_chunks", "site"), ("whatsapp_kb_chunks", "whatsapp")):
        seen_titles = {d["title"] for d in await db.kb_docs.find(
            {"workspace_id": wid, "source": source}, {"_id": 0, "title": 1}).to_list(2000)}
        cursor = db[legacy_col].find(
            {"workspace_id": wid}, {"_id": 0, "site_id": 1, "content": 1, "url": 1}
        ) if legacy_col == "site_kb_chunks" else db[legacy_col].find(
            {"workspace_id": wid}, {"_id": 0, "source_id": 1, "content": 1})

        buf: Dict[str, List[str]] = {}
        uris: Dict[str, Optional[str]] = {}
        async for c in cursor:
            key_field = "site_id" if legacy_col == "site_kb_chunks" else "source_id"
            key = str(c.get(key_field) or "unknown")
            text = (c.get("content") or "").strip()
            if text:
                buf.setdefault(key, []).append(text)
                if c.get("url"):
                    uris[key] = c["url"]

        for key, texts in buf.items():
            title = f"{source}:{key}"
            if title in seen_titles:
                continue
            joined = "\n\n".join(texts)
            doc = await ingest_document(wid, DocumentIn(
                title=title[:200], text=joined, source=source, uri=uris.get(key)))
            created_docs += 1
            created_chunks += doc["chunks"]
    await _audit(user, "kb.backfill", {"docs": created_docs, "chunks": created_chunks})
    return {"ok": True, "docs_created": created_docs, "chunks_created": created_chunks,
            "note": "run repeatedly until counts stop changing"}
