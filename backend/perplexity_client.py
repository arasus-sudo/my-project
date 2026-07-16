"""Perplexity — an optional, richer research layer for Pitch EQ.

`research_worker.py`'s free signals (site crawl, Google News RSS, public GitHub)
stay the default and the fallback — they cost nothing and already work. When a
`PERPLEXITY_API_KEY` is present, this adds one grounded, web-search-backed
synthesis call per lead on top of them, using Perplexity's `sonar` model (a
search-native model that returns cited sources, not a plain chat completion).

Mocked-first, same convention as every other paid integration in this codebase:
with no key, `research()` returns `None` and callers fall back to free signals
alone — nothing breaks, nothing silently degrades in a way that looks like real
data.

Honesty rule, matching `research_worker`'s `has_signal` gate: a Perplexity answer
only counts as a real finding when it comes back with actual citations. Sonar
occasionally answers from general knowledge with no sources when the web search
finds nothing new — that's treated as no finding, not invented confidence.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger(__name__)

PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
PERPLEXITY_MOCKED = not bool(PERPLEXITY_API_KEY)

BASE_URL = "https://api.perplexity.ai/chat/completions"
MODEL = "sonar"


async def research(company: str, domain: str = "") -> Optional[Dict[str, Any]]:
    """One grounded research call about a company. Returns
    {summary, citations[], found} or None if there's no key configured.

    `found` is False (not just an empty summary) when Perplexity answered with
    no citations — i.e. it didn't actually find anything new to ground on.
    """
    if PERPLEXITY_MOCKED or not company:
        return None

    query = f"{company}" + (f" ({domain})" if domain else "")
    system = (
        "You are a B2B sales research assistant. In 3-4 sentences, summarize what this "
        "company does, any recent news (funding, product launches, leadership changes, "
        "partnerships) from the last 90 days, and their apparent scale/focus. Be specific and "
        "factual — cite only what your sources actually say. If you find nothing recent or "
        "notable, say so plainly rather than padding with generic description."
    )
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Research: {query}"},
        ],
        "max_tokens": 400,
        "temperature": 0.2,
    }

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.post(
                BASE_URL,
                headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}",
                        "Content-Type": "application/json"},
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
    except Exception as ex:
        log.info("perplexity research failed for %s: %s", company, ex)
        return None

    try:
        summary = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError):
        return None

    citations: List[str] = [c for c in (data.get("citations") or []) if isinstance(c, str)]

    return {
        "summary": summary,
        "citations": citations[:6],
        "found": bool(citations),   # no citations = no grounded finding, don't trust it
    }
