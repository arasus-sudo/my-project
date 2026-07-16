"""Per-lead research from free public signals.

Free signals first, per the upgrade plan: the company's own site, Google News RSS
(no key, no quota), and public GitHub activity. Funding and hiring are *derived*
from those rather than bought. ProxyCurl (LinkedIn) is paid and stays behind
ENABLE_PROXYCURL, off by default.

The output is a deliberately small `ResearchPack`. It is the only thing the draft
chain and the intent engine ever see — raw pages and full news bodies never reach
an LLM. That is what keeps the four-step chain inside the org's per-minute token
budget (two heavy sequential calls already broke Proposal EQ once).

Anti-hallucination rule: when nothing is found, the pack says so with
`has_signal: False`. Downstream must degrade honestly rather than invent a reason
to reach out.
"""

import os
import re
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

from server import db, now_iso, new_id, _crawl_site

log = logging.getLogger(__name__)

ENABLE_PROXYCURL = os.environ.get("ENABLE_PROXYCURL", "").lower() in ("1", "true", "yes")
PROXYCURL_API_KEY = os.environ.get("PROXYCURL_API_KEY", "")

CACHE_DAYS = 7
NEWS_LOOKBACK_DAYS = 120

# Cheap, well-understood keyword classes. These are only used to *tag* items we
# actually found — never to manufacture a signal that isn't there.
FUNDING_WORDS = ("raises", "raised", "funding", "series a", "series b", "series c",
                 "seed round", "investment", "valuation", "acquires", "acquisition")
HIRING_WORDS = ("hiring", "hires", "appoints", "joins as", "names", "headcount",
                "expands team", "new cto", "new vp", "chief revenue")
PRODUCT_WORDS = ("launches", "launched", "unveils", "introduces", "rolls out",
                 "partnership", "integration", "expands into")


# ----------------------------- Google News RSS ---------------------------------
async def _fetch_news(company: str, domain: str = "") -> List[Dict[str, str]]:
    """Google News RSS — free, no key, no quota. Returns at most 6 recent items.

    The domain is part of the query, not decoration. Searching for a company by
    name alone is worse than useless when the name is a common word: "Linear"
    returns Linear Health Sciences, the linear alcohol market, and a paper on
    electrophoresis — and the intent engine then scores a medical-device
    partnership as a buying signal for a software company. Adding the domain
    ('"Linear" linear.app') returns only the real company. Verified against
    Linear, Vercel and Stripe.
    """
    if not company:
        return []
    import feedparser
    from urllib.parse import quote_plus

    query = f'"{company}" {domain}'.strip() if domain else f'"{company}"'
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 InnoiraSuite"})
            r.raise_for_status()
            feed = await asyncio.to_thread(feedparser.parse, r.content)
    except Exception as ex:
        log.info("news fetch failed for %s: %s", company, ex)
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=NEWS_LOOKBACK_DAYS)
    items: List[Dict[str, str]] = []
    for e in feed.entries[:20]:
        published = ""
        try:
            if getattr(e, "published_parsed", None):
                dt = datetime(*e.published_parsed[:6], tzinfo=timezone.utc)
                if dt < cutoff:
                    continue
                published = dt.date().isoformat()
        except Exception:
            pass
        title = (getattr(e, "title", "") or "").strip()
        if not title:
            continue
        items.append({"title": title[:180], "url": getattr(e, "link", ""), "published": published})
        if len(items) >= 6:
            break
    return items


def _classify_news(items: List[Dict[str, str]]) -> Dict[str, List[str]]:
    """Tag what we actually found. No item, no tag."""
    tags: Dict[str, List[str]] = {"funding": [], "hiring": [], "product": []}
    for it in items:
        low = it["title"].lower()
        if any(w in low for w in FUNDING_WORDS):
            tags["funding"].append(it["title"])
        if any(w in low for w in HIRING_WORDS):
            tags["hiring"].append(it["title"])
        if any(w in low for w in PRODUCT_WORDS):
            tags["product"].append(it["title"])
    return tags


# ----------------------------- GitHub ------------------------------------------
async def _fetch_github(company: str, domain: str) -> Dict[str, Any]:
    """Public org activity. Unauthenticated is fine at our volume (60 req/h/IP);
    a token lifts that to 5,000 if you ever set GITHUB_TOKEN."""
    org = re.sub(r"[^a-z0-9-]", "", (company or domain.split(".")[0]).lower().replace(" ", "-"))
    if not org:
        return {}
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "InnoiraSuite"}
    token = os.environ.get("GITHUB_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"https://api.github.com/orgs/{org}/repos",
                                  headers=headers, params={"sort": "pushed", "per_page": 5})
            if r.status_code != 200:
                return {}
            repos = r.json()
    except Exception:
        return {}

    if not isinstance(repos, list) or not repos:
        return {}
    langs = [r_["language"] for r_ in repos if r_.get("language")]
    return {
        "org": org,
        "recent_repos": [{"name": r_["name"], "pushed_at": (r_.get("pushed_at") or "")[:10],
                          "language": r_.get("language"), "stars": r_.get("stargazers_count", 0)}
                          for r_ in repos[:3]],
        "languages": sorted(set(langs))[:5],
    }


# ----------------------------- ProxyCurl (paid, opt-in) -------------------------
async def _fetch_linkedin(linkedin_url: str) -> Dict[str, Any]:
    """Paid enrichment. Explicitly gated: the plan says free signals first, and a
    paid provider must never fire just because a URL happens to be present."""
    if not (ENABLE_PROXYCURL and PROXYCURL_API_KEY and linkedin_url):
        return {}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://nubela.co/proxycurl/api/v2/linkedin",
                headers={"Authorization": f"Bearer {PROXYCURL_API_KEY}"},
                params={"url": linkedin_url},
            )
            if r.status_code != 200:
                return {}
            d = r.json()
    except Exception as ex:
        log.info("proxycurl failed: %s", ex)
        return {}
    return {
        "headline": d.get("headline", ""),
        "summary": (d.get("summary") or "")[:400],
        "current_role": ((d.get("experiences") or [{}])[0]).get("title", ""),
    }


# ----------------------------- The pack ----------------------------------------
def _empty_pack(lead: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "company": lead.get("company", ""), "domain": "",
        "site_summary": "", "news": [], "signals": {"funding": [], "hiring": [], "product": []},
        "github": {}, "linkedin": {}, "perplexity": {},
        "has_signal": False,
        "note": "No public signals found for this company.",
    }


def _clean_site_text(text: str) -> str:
    """Last line of defence against leaked CSS/JS reaching the LLM as prose.

    `_html_to_text` strips <style>/<script>, but a page can still ship minified
    CSS-in-JS in odd places. Feeding that to the draft chain as "what they do"
    produces confidently wrong emails, so a chunk that reads like code is dropped
    rather than summarised.
    """
    if not text:
        return ""
    # Drop obvious CSS rule bodies and JS-ish fragments.
    text = re.sub(r"[.#][\w-]+\s*\{[^}]*\}", " ", text)
    text = re.sub(r"@media[^{]*\{[\s\S]*?\}\s*\}", " ", text)
    text = re.sub(r"var\(--[\w-]+\)", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    sample = text[:600]
    if sample:
        code_chars = sum(sample.count(c) for c in "{};:<>=")
        # Prose simply doesn't hit this density of punctuation.
        if code_chars / max(1, len(sample)) > 0.06:
            return ""
    return text[:1200]


def _domain_for(lead: Dict[str, Any]) -> str:
    email = lead.get("email") or ""
    if "@" in email:
        d = email.split("@", 1)[1].lower()
        # A personal inbox tells us nothing about the company.
        if d not in ("gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"):
            return d
    return ""


async def build_pack(lead: Dict[str, Any]) -> Dict[str, Any]:
    """Gather every free signal concurrently, plus Perplexity when a key is
    configured. Returns a compact ResearchPack."""
    import perplexity_client

    company = lead.get("company") or ""
    domain = _domain_for(lead)

    site_task = asyncio.to_thread(_crawl_site, domain, 3) if domain else None
    tasks = [
        site_task or asyncio.sleep(0, result={}),
        _fetch_news(company, domain),
        _fetch_github(company, domain),
        _fetch_linkedin(lead.get("linkedin_url") or lead.get("linkedin") or ""),
        perplexity_client.research(company, domain) if company else asyncio.sleep(0, result=None),
    ]
    site, news, github, linkedin, pplx = await asyncio.gather(*tasks, return_exceptions=True)
    site = site if isinstance(site, dict) else {}
    news = news if isinstance(news, list) else []
    github = github if isinstance(github, dict) else {}
    linkedin = linkedin if isinstance(linkedin, dict) else {}
    pplx = pplx if isinstance(pplx, dict) else None

    # Cap hard: the site crawl can return tens of thousands of characters, and the
    # whole point of the pack is that it stays small enough to feed four LLM calls.
    site_text = _clean_site_text(" ".join(site.values())) if site else ""

    signals = _classify_news(news)
    # A grounded Perplexity finding (real citations, not a no-source guess) is
    # strong enough evidence on its own — it can carry has_signal even when the
    # free-signal fan-out came back empty (a company can be newsworthy without a
    # crawlable site or a Google News hit in the last 120 days).
    pplx_found = bool(pplx and pplx.get("found"))
    has_signal = bool(site_text or news or github or pplx_found)

    pack = {
        "company": company,
        "domain": domain,
        "site_summary": site_text,
        "news": news,
        "signals": signals,
        "github": github,
        "linkedin": linkedin,
        "perplexity": {"summary": pplx["summary"], "citations": pplx["citations"]} if pplx_found else {},
        "has_signal": has_signal,
    }
    if not has_signal:
        pack["note"] = "No public signals found for this company."
    return pack


async def get_research(workspace_id: str, lead: Dict[str, Any], force: bool = False) -> Dict[str, Any]:
    """Cached per lead for 7 days. Research is slow (4 network fan-outs) and the
    answer barely moves day to day."""
    cached = await db.lead_research.find_one(
        {"workspace_id": workspace_id, "lead_id": lead["id"]}, {"_id": 0})
    if cached and not force:
        try:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(cached["researched_at"])
            if age < timedelta(days=CACHE_DAYS):
                return cached["pack"]
        except Exception:
            pass

    pack = await build_pack(lead)
    await db.lead_research.update_one(
        {"workspace_id": workspace_id, "lead_id": lead["id"]},
        {"$set": {
            "id": cached["id"] if cached else new_id(),
            "workspace_id": workspace_id, "lead_id": lead["id"],
            "pack": pack, "researched_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return pack


def summarize_for_prompt(pack: Dict[str, Any]) -> str:
    """The pack as the LLM sees it — trimmed hard. Anything not here doesn't exist
    as far as the draft chain is concerned, which is the anti-hallucination boundary."""
    if not pack.get("has_signal"):
        return "NO PUBLIC SIGNALS FOUND. Do not invent a trigger or a reason to reach out."

    parts = [f"Company: {pack['company']}"]

    pplx = pack.get("perplexity") or {}
    if pplx.get("summary"):
        # Grounded web-search synthesis (Perplexity), when available — usually
        # more current than the site crawl and cheaper to trust since it only
        # gets here when it returned real citations.
        parts.append(f"Current research ({len(pplx.get('citations', []))} cited sources): {pplx['summary']}")

    if pack.get("site_summary"):
        parts.append(f"What they do (from their site): {pack['site_summary'][:600]}")

    sig = pack.get("signals") or {}
    for kind in ("funding", "hiring", "product"):
        if sig.get(kind):
            parts.append(f"{kind.title()} news: " + "; ".join(sig[kind][:2]))

    news = pack.get("news") or []
    if news and not any(sig.values()):
        parts.append("Recent news: " + "; ".join(n["title"] for n in news[:2]))

    gh = pack.get("github") or {}
    if gh.get("languages"):
        parts.append(f"Public tech stack (GitHub): {', '.join(gh['languages'])}")

    li = pack.get("linkedin") or {}
    if li.get("headline"):
        parts.append(f"Their LinkedIn headline: {li['headline']}")

    return "\n".join(parts)
