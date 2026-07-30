"""Stock-photo search for CreateEQ's Asset Intelligence Layer.

Two free providers (Unsplash, Pexels), queried in parallel and merged/ranked
into one result list. Each adapter is skipped — not an error — when its key
isn't configured, so this ships and works (partially, then fully) before both
keys exist, matching the pattern already used for optional providers elsewhere
in this app (e.g. GEMINI_API_KEY / OPENAI_API_KEY gating in generate_ai_image).

Deliberately NOT wired through billing.charge_credits — unlike AI image
generation, a stock-photo search costs us nothing per call, so it isn't
metered.
"""

import logging
import os
import asyncio
import random
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("asset_engine")

UNSPLASH_ACCESS_KEY = os.environ.get("UNSPLASH_ACCESS_KEY", "")
PEXELS_API_KEY = os.environ.get("PEXELS_API_KEY", "")

_TIMEOUT = httpx.Timeout(8.0)


def configured_providers() -> List[str]:
    out = []
    if UNSPLASH_ACCESS_KEY:
        out.append("unsplash")
    if PEXELS_API_KEY:
        out.append("pexels")
    return out


async def _search_unsplash(query: str, page: int) -> List[Dict[str, Any]]:
    if not UNSPLASH_ACCESS_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.unsplash.com/search/photos",
                params={"query": query, "page": page, "per_page": 20},
                headers={"Authorization": f"Client-ID {UNSPLASH_ACCESS_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []
    out = []
    for p in data.get("results", []):
        urls = p.get("urls") or {}
        user = p.get("user") or {}
        out.append({
            "id": f"unsplash-{p.get('id')}",
            "url": urls.get("regular") or urls.get("full") or urls.get("small"),
            "thumb_url": urls.get("thumb") or urls.get("small"),
            "width": p.get("width"),
            "height": p.get("height"),
            "source": "unsplash",
            "credit_name": user.get("name") or "Unsplash",
            "credit_url": (user.get("links") or {}).get("html") or "https://unsplash.com",
        })
    return out


async def _search_pexels(query: str, page: int) -> List[Dict[str, Any]]:
    if not PEXELS_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.pexels.com/v1/search",
                params={"query": query, "page": page, "per_page": 20},
                headers={"Authorization": PEXELS_API_KEY},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []
    out = []
    for p in data.get("photos", []):
        src = p.get("src") or {}
        out.append({
            "id": f"pexels-{p.get('id')}",
            "url": src.get("large") or src.get("original") or src.get("medium"),
            "thumb_url": src.get("tiny") or src.get("small"),
            "width": p.get("width"),
            "height": p.get("height"),
            "source": "pexels",
            "credit_name": p.get("photographer") or "Pexels",
            "credit_url": p.get("photographer_url") or "https://pexels.com",
        })
    return out


def rank(assets: List[Dict[str, Any]], target_aspect: Optional[float] = None) -> List[Dict[str, Any]]:
    """First-cut relevance heuristic: aspect-ratio fit to the slot being
    filled, then resolution, then interleave by source so one provider
    doesn't dominate the top of the results. Not a learned ranker — refine
    the weights once there's real usage to look at."""
    def score(a: Dict[str, Any]) -> float:
        w, h = a.get("width") or 0, a.get("height") or 0
        s = 0.0
        if target_aspect and w and h:
            s -= abs((w / h) - target_aspect) * 2
        s += min((w or 0) * (h or 0), 4_000_000) / 4_000_000
        return s

    scored = sorted(assets, key=score, reverse=True)
    by_source: Dict[str, List[Dict[str, Any]]] = {}
    for a in scored:
        by_source.setdefault(a["source"], []).append(a)
    interleaved = []
    while any(by_source.values()):
        for src in list(by_source.keys()):
            if by_source[src]:
                interleaved.append(by_source[src].pop(0))
    return interleaved


async def search_photos(query: str, page: int = 1, target_aspect: Optional[float] = None) -> Dict[str, Any]:
    results = await asyncio.gather(_search_unsplash(query, page), _search_pexels(query, page))
    merged = [a for group in results for a in group]
    random.shuffle(merged)  # avoid always favoring whichever provider's gather() resolved first
    return {"results": rank(merged, target_aspect), "providers_configured": configured_providers()}


async def derive_search_terms(slide_content: Dict[str, Any], user: Dict[str, Any]) -> List[str]:
    """Turns a slide's actual text content into concrete photo search phrases
    — e.g. "CRM dashboard, sales analytics" instead of the slide's raw
    headline — via the same LLM helper already used elsewhere in the app."""
    import json
    from server import _llm_chat, _extract_json

    system = (
        "You turn a presentation slide's text content into concrete stock-photo search "
        "phrases describing what a relevant, on-topic photo should show — never the slide's "
        "raw headline text itself. Return 3-5 short phrases (2-4 words each), most useful "
        "first. STRICT JSON only: {\"terms\": [str, ...]}"
    )
    user_text = json.dumps(slide_content)[:2000]
    try:
        resp = await _llm_chat(system, user_text, f"creq-asset-{user['id']}", user=user, max_tokens=200,
                                agent="create", action="asset_search_terms")
        parsed = _extract_json(resp) or {}
    except Exception as ex:
        logger.warning("derive_search_terms failed, falling back to no terms: %s", ex)
        return []
    terms = parsed.get("terms") or []
    return [t.strip() for t in terms if isinstance(t, str) and t.strip()][:5]
