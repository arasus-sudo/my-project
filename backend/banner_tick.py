"""Signature banner refresh — the ONLY piece of signature rendering ported to
Python. The rest of the signature HTML (renderHtml.js) stays JS-only and is
computed client-side; re-implementing the whole renderer here would be a real
double-maintenance risk. Banners are different: their rendered markup is
trivial (an <a><img></a>), so the small win of porting just this selection
logic lets stored content_html stay in sync with "today" without a browser —
via the daily tick below — instead of only updating whenever a user happens
to reopen the editor.

Each banner block's currently-active variant is wrapped in the stored
content_html as `<!--BANNER:{block_id}-->...<!--/BANNER:{block_id}-->`
(written by renderBanner() in renderHtml.js) — this module finds that span
and swaps in whichever variant should be active today.
"""

import re
from datetime import date, datetime, timezone
from html import escape
from typing import Any, Dict, List, Optional

MARKER_RE_TEMPLATE = r"<!--BANNER:{bid}-->.*?<!--/BANNER:{bid}-->"


def _today_str() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def pick_active_variant(items: List[Dict[str, Any]], today: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Mirrors activeBannerVariant() in renderHtml.js exactly: a dated variant
    wins if today falls in [startDate, endDate] (either bound optional);
    otherwise the one variant with neither bound set is the fallback."""
    today = today or _today_str()
    dated = None
    fallback = None
    for it in items or []:
        start, end = it.get("startDate") or "", it.get("endDate") or ""
        if start or end:
            if (not start or start <= today) and (not end or end >= today):
                dated = it
                break
        elif fallback is None:
            fallback = it
    return dated or fallback


def _render_variant_html(item: Optional[Dict[str, Any]]) -> str:
    if not item or not item.get("imageUrl"):
        return ""
    img = f'<img src="{escape(item["imageUrl"])}" alt="" style="display:block;max-width:100%;border:0;" />'
    link = item.get("link")
    inner = f'<a href="{escape(link)}">{img}</a>' if link else img
    return f'<div style="margin-top:8px;">{inner}</div>'


def refresh_banner_html(content_html: str, blocks_json: List[Dict[str, Any]]) -> Optional[str]:
    """Returns updated content_html with each banner block's marker span
    swapped to today's active variant, or None if there's nothing to change
    (no banner blocks, or the markup already matches today's pick)."""
    banner_blocks = [b for b in (blocks_json or []) if b.get("type") == "banner"]
    if not banner_blocks:
        return None

    updated = content_html
    changed = False
    today = _today_str()
    for b in banner_blocks:
        bid = b.get("id")
        if not bid:
            continue
        active = pick_active_variant((b.get("data") or {}).get("items", []), today)
        new_inner = f"<!--BANNER:{bid}-->{_render_variant_html(active)}<!--/BANNER:{bid}-->"
        pattern = MARKER_RE_TEMPLATE.format(bid=re.escape(bid))
        if re.search(pattern, updated, flags=re.DOTALL):
            replaced = re.sub(pattern, lambda _m: new_inner, updated, count=1, flags=re.DOTALL)
            if replaced != updated:
                changed = True
            updated = replaced
    return updated if changed else None


async def run_signature_banner_tick() -> None:
    """Daily tick: keep every signature with a banner block's stored
    content_html in sync with today's active variant, so a signature that
    nobody reopens still reflects the current campaign when it's read for a
    send or viewed in the list."""
    from server import db
    cursor = db.signatures.find(
        {"blocks_json.type": "banner"}, {"_id": 0, "id": 1, "content_html": 1, "blocks_json": 1}
    )
    async for sig in cursor:
        new_html = refresh_banner_html(sig.get("content_html", ""), sig.get("blocks_json", []))
        if new_html is not None:
            await db.signatures.update_one({"id": sig["id"]}, {"$set": {"content_html": new_html}})
