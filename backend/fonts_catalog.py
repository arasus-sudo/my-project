"""Google Fonts catalog — real fonts, zero credentials.

The obvious way to do this is Google's Fonts Developer API
(`googleapis.com/webfonts/v1/webfonts`), but that requires an API key. There's a
better option: `fonts.google.com/metadata/fonts` is the same **public, keyless**
feed the fonts.google.com picker itself calls client-side — verified live during
planning (real family names: ABeeZee, Advent Pro, Afacad, Albert Sans, ...), full
per-family metadata (category, popularity, loadable weights). No key, no cost,
no setup, and it's the live catalog rather than a hand-curated snapshot that goes
stale.

Actually *loading* a chosen font for display still uses the standard keyless
CSS2 endpoint (`fonts.googleapis.com/css2?family=...`) — same mechanism the
existing 10-font preload in `public/index.html` already uses. This module only
serves the searchable catalog; the frontend injects font `<link>` tags itself.

Cached in-process for 24h: the catalog is identical for every workspace (it's
not tenant data), so this is a single shared cache, not per-workspace state.
"""

import logging
import re
import time
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger(__name__)

METADATA_URL = "https://fonts.google.com/metadata/fonts"
CACHE_SECONDS = 24 * 60 * 60

_cache: Dict[str, Any] = {"fonts": None, "fetched_at": 0.0}

# A small, safe default so the picker has *something* to show even on the very
# first request before the feed has been fetched, or if Google's endpoint is
# ever unreachable — these are the same 10 already preloaded in index.html, so
# there's zero risk of a family name that doesn't actually exist.
_FALLBACK = [
    {"family": "Inter", "category": "Sans Serif", "popularity": 1, "weights": [400, 500, 700]},
    {"family": "Manrope", "category": "Sans Serif", "popularity": 2, "weights": [400, 700]},
    {"family": "Poppins", "category": "Sans Serif", "popularity": 3, "weights": [400, 600, 700]},
    {"family": "Space Grotesk", "category": "Sans Serif", "popularity": 4, "weights": [400, 700]},
    {"family": "Archivo Black", "category": "Sans Serif", "popularity": 5, "weights": [400]},
    {"family": "Bebas Neue", "category": "Display", "popularity": 6, "weights": [400]},
    {"family": "Playfair Display", "category": "Serif", "popularity": 7, "weights": [400, 700]},
    {"family": "Instrument Serif", "category": "Serif", "popularity": 8, "weights": [400]},
    {"family": "DM Serif Display", "category": "Serif", "popularity": 9, "weights": [400]},
    {"family": "JetBrains Mono", "category": "Monospace", "popularity": 10, "weights": [400, 700]},
]


def _parse_weights(fonts_obj: Dict[str, Any]) -> List[int]:
    """The feed's `fonts` object is keyed by weight, sometimes with an 'italic'
    suffix ('400', '700', '400italic', ...). The picker only needs the numeric
    weights, deduped and sorted."""
    out = set()
    for key in (fonts_obj or {}).keys():
        m = re.match(r"^(\d+)", str(key))
        if m:
            out.add(int(m.group(1)))
    return sorted(out) or [400]


async def _fetch_live() -> Optional[List[Dict[str, Any]]]:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(METADATA_URL, headers={"User-Agent": "Mozilla/5.0 InnoiraSuite"})
            r.raise_for_status()
            text = r.text
    except Exception as ex:
        log.warning("google fonts metadata fetch failed: %s", ex)
        return None

    # Several Google JSON feeds are prefixed with an anti-hijacking guard —
    # strip it if present before parsing.
    text = re.sub(r"^\)\]\}'\n?", "", text)
    try:
        import json
        data = json.loads(text)
    except Exception as ex:
        log.warning("google fonts metadata parse failed: %s", ex)
        return None

    families = data.get("familyMetadataList") or data.get("fonts") or data
    if not isinstance(families, list):
        return None

    out = []
    for f in families:
        family = f.get("family")
        if not family:
            continue
        out.append({
            "family": family,
            "category": f.get("category") or "Sans Serif",
            "popularity": f.get("popularity") or 99999,
            "weights": _parse_weights(f.get("fonts")),
        })
    return out or None


async def _get_catalog() -> List[Dict[str, Any]]:
    now = time.time()
    if _cache["fonts"] is not None and (now - _cache["fetched_at"]) < CACHE_SECONDS:
        return _cache["fonts"]

    fresh = await _fetch_live()
    if fresh:
        _cache["fonts"] = fresh
        _cache["fetched_at"] = now
        return fresh

    # Fetch failed — serve the last good cache if we have one, otherwise the
    # small hardcoded fallback. Either way the picker never breaks.
    return _cache["fonts"] or _FALLBACK


async def search(q: str = "", category: str = "", limit: int = 60) -> Dict[str, Any]:
    """Server-side search/filter so the client only ever gets a small page, not
    the ~1800-family catalog."""
    catalog = await _get_catalog()

    results = catalog
    if category:
        cat_lower = category.strip().lower()
        results = [f for f in results if f["category"].lower() == cat_lower]
    if q:
        q_lower = q.strip().lower()
        results = [f for f in results if q_lower in f["family"].lower()]

    # Popularity in the feed is a rank (1 = most popular), so ascending sort
    # surfaces well-known families first — much better default ordering than
    # alphabetical for a "pick something good-looking" picker.
    results = sorted(results, key=lambda f: f["popularity"])[:max(1, min(limit, 200))]

    return {
        "fonts": results,
        "total_catalog_size": len(catalog),
        "live": _cache["fonts"] is not None,
    }


def categories() -> List[str]:
    return ["Sans Serif", "Serif", "Display", "Handwriting", "Monospace"]
