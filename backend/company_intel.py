"""Company Intelligence Engine — Deep Website Crawl + AI Company Profile.

Crawls every reachable page on a domain, classifies content by page type,
then runs AI analysis to build a structured Company Profile. Never crawls
the same domain twice unless the user explicitly refreshes.
"""

import asyncio
import json
import logging
import re
from typing import Dict, List, Optional, Any
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import db, current_user, now_iso, new_id, _llm_chat, _extract_json, ANTHROPIC_API_KEY, _rate_ok

logger = logging.getLogger("company_intel")
router = APIRouter(prefix="/company-intel")

PAGE_TYPES = [
    "homepage", "about", "services", "products", "solutions",
    "pricing", "industries", "resources", "case_studies", "blog",
    "faq", "contact", "privacy", "documentation", "careers", "team",
    "integrations", "partners", "events", "other",
]

PAGE_KEYWORDS = {
    "about": ["about", "our-story", "who-we-are", "company", "mission", "values"],
    "services": ["service", "what-we-do", "our-work", "capabilities"],
    "products": ["product", "platform", "solution", "software"],
    "solutions": ["solution", "use-case", "industry"],
    "pricing": ["pricing", "plans", "subscription", "cost", "price"],
    "industries": ["industry", "verticals", "sector"],
    "resources": ["resource", "knowledge-base", "documentation", "wiki", "docs"],
    "case_studies": ["case-study", "case study", "customer-story", "success-story", "testimonial"],
    "blog": ["blog", "insights", "articles", "news", "journal", "updates"],
    "faq": ["faq", "faqs", "frequently-asked", "questions"],
    "contact": ["contact", "get-in-touch", "support", "help"],
    "privacy": ["privacy", "privacy-policy", "gdpr", "data-protection"],
    "documentation": ["documentation", "docs", "api-docs", "api", "developer"],
    "careers": ["careers", "jobs", "join-us", "team"],
    "team": ["team", "leadership", "management", "board"],
    "integrations": ["integration", "partner", "marketplace", "connect"],
    "partners": ["partner", "alliance", "reseller"],
    "events": ["events", "webinar", "conference", "summit"],
}


class CrawlIn(BaseModel):
    url: str


class CrawlResult(BaseModel):
    id: str
    domain: str
    status: str
    pages_crawled: int
    profile: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Crawler
# ---------------------------------------------------------------------------

async def _async_fetch(url: str, timeout: int = 8) -> Optional[str]:
    """Fetch a single URL and return cleaned text."""
    if not url.startswith("http"):
        url = "https://" + url
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 InnoiraSuite/CompanyIntel"})
            r.raise_for_status()
            raw = r.text
    except Exception as ex:
        logger.debug("fetch failed %s: %s", url, ex)
        return None
    raw = re.sub(r"<(script|style)\b[^>]*>[\s\S]*?(?:</\1\s*>|$)", " ", raw, flags=re.I)
    raw = re.sub(r"<!--[\s\S]*?(?:-->|$)", " ", raw)
    return raw


def _classify_page(url: str, html: str, title: str) -> str:
    """Classify a page based on its URL and content."""
    url_lower = url.lower()
    for ptype, keywords in PAGE_KEYWORDS.items():
        if any(k in url_lower for k in keywords):
            return ptype
    title_lower = title.lower()
    for ptype, keywords in PAGE_KEYWORDS.items():
        if any(k in title_lower for k in keywords):
            return ptype
    return "other"


def _extract_title(html: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return m.group(1).strip() if m else ""


def _html_to_clean_text(html: str, max_chars: int = 8000) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&[a-z]+;|&#\d+;", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _extract_links(html: str, base_url: str) -> List[str]:
    """Extract all internal links from HTML."""
    parsed = urlparse(base_url)
    domain = parsed.netloc
    scheme = parsed.scheme
    hrefs = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)
    links = set()
    for h in hrefs:
        full = urljoin(f"{scheme}://{domain}/", h.split("#")[0])
        p = urlparse(full)
        if p.netloc == domain and p.scheme in ("http", "https"):
            clean = f"{p.scheme}://{p.netloc}{p.path.rstrip('/')}" if p.path else f"{p.scheme}://{p.netloc}"
            if clean and not any(skip in clean for skip in (".pdf", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".mp4", ".mp3")):
                links.add(clean)
    return list(links)


async def _deep_crawl(root_url: str, max_pages: int = 30) -> List[Dict[str, Any]]:
    """Crawl all internal pages, up to max_pages."""
    if not root_url.startswith("http"):
        root_url = "https://" + root_url
    parsed = urlparse(root_url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    pages = []
    seen = set()
    to_visit = [base]

    while to_visit and len(pages) < max_pages:
        url = to_visit.pop(0)
        if url in seen:
            continue
        seen.add(url)

        html = await _async_fetch(url)
        if not html:
            continue

        title = _extract_title(html)
        page_type = _classify_page(url, html, title)
        content = _html_to_clean_text(html, 8000)

        pages.append({
            "url": url,
            "title": title,
            "type": page_type,
            "content": content,
        })

        links = _extract_links(html, base)
        for link in links:
            if link not in seen and link not in to_visit and link.startswith(base):
                to_visit.append(link)

    return pages


# ---------------------------------------------------------------------------
# AI Profile Builder
# ---------------------------------------------------------------------------

PROFILE_SYSTEM_PROMPT = """You are a Senior Sales Intelligence Analyst at a top-tier market research firm.

Your job is to analyse a company's website content and build a comprehensive Company Intelligence Profile that a sales team would use to craft outbound campaigns.

Analyse ALL provided pages (homepage, about, services, products, blog, pricing, case studies, etc.) and build a detailed profile.

Return STRICT JSON ONLY with this exact schema (no markdown, no prose):
{
  "name": "Company name",
  "industry": "Primary industry",
  "description": "2-3 sentence summary of what the company does",
  "company_size": "Estimated employee count range",
  "founded": "Year founded or null",
  "location": "HQ location or null",
  "target_market": "Who they sell to",
  "ideal_customer": "Their ideal customer profile",
  "pain_points": ["Pain point 1", "Pain point 2", "..."],
  "differentiators": ["Differentiator 1", "Differentiator 2", "..."],
  "competitors": ["Competitor 1", "Competitor 2", "..."],
  "products_services": ["Product/service 1", "Product/service 2", "..."],
  "pricing_model": "How they price or null if not found",
  "usp": "Unique selling proposition in one sentence",
  "target_audience": "Who they target",
  "brand_tone": "Professional, technical, casual, luxury, etc.",
  "communication_style": "How they communicate",
  "buying_stage": "Typical buying stage maturity",
  "sales_cycle": "Estimated sales cycle length",
  "keywords": ["keyword 1", "keyword 2", "..."],
  "tech_stack": ["technology 1", "technology 2", "..."],
  "case_studies_summary": "Summary of any case studies found or null",
  "blogs_summary": "Summary of blog/resource topics or null"
}"""


async def _build_ai_profile(pages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Send crawled pages to LLM and get structured profile."""
    pages_text = ""
    for p in pages:
        pages_text += f"\n--- [{p['type'].upper()}] {p['url']}\n{p['content'][:3000]}\n"

    user_text = f"Analyse this company's website content and build a complete intelligence profile:\n\n{pages_text}"

    try:
        raw = await _llm_chat(PROFILE_SYSTEM_PROMPT, user_text, f"company-intel-{new_id()[:8]}", max_tokens=4096)
        parsed = _extract_json(raw)
        if parsed:
            return parsed
        logger.warning("AI profile build: _extract_json returned None. Raw preview: %s", (raw or "")[:300])
    except Exception as ex:
        logger.error("AI profile build failed: %s", ex)

    return {
        "name": "",
        "industry": "",
        "description": "AI analysis unavailable",
        "company_size": "",
        "founded": None,
        "location": None,
        "target_market": "",
        "ideal_customer": "",
        "pain_points": [],
        "differentiators": [],
        "competitors": [],
        "products_services": [],
        "pricing_model": None,
        "usp": "",
        "target_audience": "",
        "brand_tone": "",
        "communication_style": "",
        "buying_stage": "",
        "sales_cycle": "",
        "keywords": [],
        "tech_stack": [],
        "case_studies_summary": None,
        "blogs_summary": None,
    }


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------


@router.post("/crawl")
async def crawl_company(body: CrawlIn, user=Depends(current_user)):
    """Deep crawl a company website and build intelligence profile."""
    domain = urlparse(body.url if body.url.startswith("http") else f"https://{body.url}").netloc

    existing = await db.company_intel.find_one(
        {"workspace_id": user["workspace_id"], "domain": domain},
        {"_id": 0},
    )
    if existing:
        return {"status": "cached", "data": existing}

    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")

    doc_id = new_id()

    await db.company_intel.insert_one({
        "id": doc_id,
        "workspace_id": user["workspace_id"],
        "domain": domain,
        "url": body.url,
        "status": "crawling",
        "pages_crawled": 0,
        "pages": [],
        "profile": {},
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })

    try:
        pages = await _deep_crawl(body.url)
        profile = await _build_ai_profile(pages)

        await db.company_intel.update_one(
            {"id": doc_id},
            {
                "$set": {
                    "status": "complete",
                    "pages_crawled": len(pages),
                    "pages": pages,
                    "profile": profile,
                    "updated_at": now_iso(),
                }
            },
        )

        return {
            "status": "complete",
            "data": {
                "id": doc_id,
                "domain": domain,
                "url": body.url,
                "status": "complete",
                "pages_crawled": len(pages),
                "profile": profile,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            },
        }
    except Exception as ex:
        await db.company_intel.update_one(
            {"id": doc_id},
            {"$set": {"status": "error", "error": str(ex), "updated_at": now_iso()}},
        )
        raise HTTPException(502, f"Crawl failed: {ex}")


@router.get("/crawl/{domain}")
async def get_company_intel(domain: str, user=Depends(current_user)):
    """Get company intelligence for a domain."""
    doc = await db.company_intel.find_one(
        {"workspace_id": user["workspace_id"], "domain": domain},
        {"_id": 0, "pages": 0},
    )
    if not doc:
        raise HTTPException(404, "No intelligence found for this domain. Crawl it first.")
    return doc


@router.get("/crawl")
async def list_company_intel(user=Depends(current_user)):
    """List all crawled companies."""
    docs = await db.company_intel.find(
        {"workspace_id": user["workspace_id"]},
        {"_id": 0, "pages": 0},
    ).sort("updated_at", -1).to_list(50)
    return docs


@router.delete("/crawl/{domain}")
async def delete_company_intel(domain: str, user=Depends(current_user)):
    """Delete company intelligence for a domain."""
    await db.company_intel.delete_one(
        {"workspace_id": user["workspace_id"], "domain": domain},
    )
    return {"ok": True}
