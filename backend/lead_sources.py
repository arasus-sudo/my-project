"""Lead sourcing + email verification — typed provider clients.

Calls Prospeo (search-person + bulk-enrich-person) for people data,
Icypeas for email verification. Mock data is returned *only* when
there is no API key configured — never on a real provider error.
"""
import os, re, asyncio, logging
from typing import Any, Dict, List, Optional
import httpx

log = logging.getLogger(__name__)

PROSPEO_API_KEY = os.environ.get("PROSPEO_API_KEY", "")
ICYPEAS_API_KEY = os.environ.get("ICYPEAS_API_KEY", "")
ICYPEAS_API_SECRET = os.environ.get("ICYPEAS_API_SECRET", "")

PROSPEO_BASE = "https://api.prospeo.io"
ICYPEAS_BASE = "https://app.icypeas.com/api"

PROSPEO_MOCKED = not bool(PROSPEO_API_KEY)
ICYPEAS_MOCKED = not bool(ICYPEAS_API_KEY)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
_CONCURRENCY = asyncio.Semaphore(5)


class ProviderError(RuntimeError):
    def __init__(self, provider: str, message: str, status: Optional[int] = None):
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.status = status


async def _request(provider: str, method: str, url: str, *,
                   headers: Dict[str, str], json: Dict[str, Any],
                   attempts: int = 3) -> Dict[str, Any]:
    delay = 1.0
    last = ""
    for attempt in range(1, attempts + 1):
        try:
            async with _CONCURRENCY:
                async with httpx.AsyncClient(timeout=120) as client:
                    r = await client.request(method, url, headers=headers, json=json)
            if r.status_code in (429,) or r.status_code >= 500:
                last = f"HTTP {r.status_code}"
                if attempt < attempts:
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                raise ProviderError(provider, f"{last} after {attempts} attempts", r.status_code)
            if r.status_code >= 400:
                raise ProviderError(provider, f"HTTP {r.status_code}: {r.text[:300]}", r.status_code)
            return r.json()
        except httpx.HTTPError as ex:
            last = str(ex)
            if attempt < attempts:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            raise ProviderError(provider, f"network error: {last}")
    raise ProviderError(provider, last or "unknown error")


# ── Normalisation ──────────────────────────────────────────────────────

def _extract_email(val: Any) -> str:
    if isinstance(val, dict):
        e = (val.get("email") or "").strip()
    else:
        e = (val or "").strip()
    return "" if "*" in e else e


def _extract_phone(mobile: Any) -> str:
    if isinstance(mobile, dict):
        if mobile.get("revealed") and mobile.get("mobile"):
            return mobile["mobile"]
        return mobile.get("mobile_international") or mobile.get("mobile") or ""
    return str(mobile or "")


def _extract_location(loc: Any) -> Dict[str, str]:
    if isinstance(loc, dict):
        return {k: str(v or "") for k, v in loc.items()
                if v and k in ("country", "state", "city", "country_code")}
    return {}


def normalize_prospect(person: Dict[str, Any], domain: str,
                       company: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    company = company or {}
    name = person.get("name") or person.get("full_name") or ""
    first = person.get("first_name") or (name.split(" ", 1)[0] if name else "")
    last = person.get("last_name") or (name.split(" ", 1)[-1] if " " in name else "")
    title = (person.get("job_title") or person.get("current_job_title")
             or (person.get("current_job") or {}).get("job_title") or "")
    email = _extract_email(person.get("email")).lower()
    mobile = _extract_phone(person.get("mobile"))
    loc = _extract_location(person.get("location"))
    return {
        "first_name": first,
        "last_name": last,
        "full_name": person.get("full_name") or f"{first} {last}",
        "email": email,
        "phone": mobile,
        "title": title,
        "headline": person.get("headline") or "",
        "company": company.get("name") or domain.split(".")[0].title(),
        "company_website": company.get("website") or "",
        "company_domain": company.get("domain") or domain,
        "company_industry": company.get("industry") or "",
        "company_size": company.get("employee_range") or "",
        "company_description": (company.get("description_ai") or company.get("description") or ""),
        "company_logo": company.get("logo_url") or "",
        "company_linkedin": company.get("linkedin_url") or "",
        "domain": domain,
        "linkedin_url": person.get("linkedin_url") or "",
        "location": loc,
        "skills": person.get("skills") or [],
        "source": "prospeo",
        "confidence": 0.85,
    }


# ── Mock ───────────────────────────────────────────────────────────────

_MOCK_NAMES = [
    ("Alex", "Rivera", "VP Sales"), ("Priya", "Shah", "Head of Growth"),
    ("Marcus", "Chen", "Founder"), ("Sofia", "Nunez", "Director of RevOps"),
    ("Daniel", "Okafor", "CTO"), ("Emma", "Whitfield", "Marketing Lead"),
    ("Ravi", "Menon", "COO"), ("Jules", "Beaumont", "Head of Sales"),
    ("Kenji", "Tanaka", "VP Product"), ("Ines", "Costa", "Head of Marketing"),
]


def _mock_domain_search(domain: str, limit: int) -> List[Dict[str, Any]]:
    d = clean_domain(domain) or "example.com"
    slug = d.split(".")[0]
    company_name = slug.title()
    return [{
        "first_name": fn, "last_name": ln, "full_name": f"{fn} {ln}",
        "email": f"{fn.lower()}.{ln.lower()}@{d}",
        "phone": f"+1-555-{hash(fn+ln)%9000+1000:04d}",
        "title": title,
        "headline": f"{title} at {company_name}",
        "company": company_name,
        "company_website": f"https://{d}", "company_domain": d,
        "company_industry": "Software", "company_size": "51-200",
        "company_description": "Mock company for testing.",
        "company_logo": "", "company_linkedin": f"https://linkedin.com/company/{slug}",
        "domain": d,
        "linkedin_url": f"https://linkedin.com/in/{fn.lower()}-{ln.lower()}-{slug}",
        "location": {"country": "United States", "state": "California", "city": "San Francisco"},
        "skills": ["Sales", "CRM", "Outreach"],
        "source": "prospeo", "confidence": 0.5, "mocked": True,
    } for fn, ln, title in _MOCK_NAMES[:limit]]


def clean_domain(domain: Optional[str]) -> str:
    if not domain:
        return ""
    d = domain.strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = d.split("/")[0]
    return d[4:] if d.startswith("www.") else d


# ── Prospeo ────────────────────────────────────────────────────────────

_PROSPEO_HEADERS = {"X-KEY": PROSPEO_API_KEY, "Content-Type": "application/json"}


async def _search_and_enrich(filters: Dict[str, Any], domain: str, limit: int,
                             *, include_mobile: bool = False) -> List[Dict[str, Any]]:
    """Search Prospeo with filters, then bulk-enrich to reveal emails/mobiles.

    Per Prospeo docs (2026):
      - /search-person returns person objects with email/mobile as masked objects
      - /bulk-enrich-person reveals them; accepts only_verified_email, enrich_mobile
      - enrich_mobile=true costs 10 credits/mobile found (email included free)
    """
    try:
        search_data = await _request(
            "prospeo", "POST", f"{PROSPEO_BASE}/search-person",
            headers=_PROSPEO_HEADERS,
            json={"page": 1, "filters": filters},
        )
    except ProviderError as e:
        if "NO_RESULTS" in str(e):
            return []
        raise

    hits = search_data.get("results") or []
    ids = [(h.get("person") or {}).get("person_id") for h in hits[:limit]]
    ids = [pid for pid in ids if pid]
    if not ids:
        return []

    # Build enrich params per Prospeo docs:
    #   only_verified_email=true  → only return records with verified email
    #   enrich_mobile=true        → reveal mobile (costs 10 credits ea)
    enrich_opts: Dict[str, Any] = {"data": [{"identifier": pid, "person_id": pid} for pid in ids]}
    if include_mobile:
        enrich_opts["only_verified_email"] = False
        enrich_opts["enrich_mobile"] = True
    else:
        enrich_opts["only_verified_email"] = True

    enrich_data = await _request(
        "prospeo", "POST", f"{PROSPEO_BASE}/bulk-enrich-person",
        headers=_PROSPEO_HEADERS,
        json=enrich_opts,
    )
    matched = enrich_data.get("matched") or []
    out = [normalize_prospect(m.get("person") or {}, domain, m.get("company"))
           for m in matched]

    if include_mobile:
        return [p for p in out if p["email"] or p["phone"]][:limit]
    return [p for p in out if p["email"]][:limit]


def _build_prospeo_filters(*, domain: str = "", titles=None, locations=None,
                            industries=None, company_sizes=None,
                            seniority=None) -> Dict[str, Any]:
    """Build Prospeo filter object from user-supplied values.

    Per docs:
      - person_job_title accepts include/exclude/match_mode (CONTAINS recommended)
      - person_seniority uses enum values: C-Suite, Vice President, Director, etc.
      - company_industry uses industry enum values
      - company_headcount_custom uses min/max integers
      - company.websites.include uses root domains
    """
    filters: Dict[str, Any] = {}

    if titles:
        filters["person_job_title"] = {"include": titles, "match_mode": "CONTAINS"}
    if locations:
        filters["person_location_search"] = {"include": locations}
    if industries:
        filters["company_industry"] = {"include": industries}
    if seniority:
        filters["person_seniority"] = {"include": seniority}
    if company_sizes:
        mins, maxs = [], []
        for s in company_sizes:
            s = s.strip()
            if "+" in s:
                mins.append(int(s.replace("+", "")))
            elif "-" in s:
                parts = s.split("-", 1)
                mins.append(int(parts[0]))
                maxs.append(int(parts[1]))
        if mins or maxs:
            headcount: Dict[str, int] = {}
            if mins:
                headcount["min"] = min(mins)
            if maxs:
                headcount["max"] = max(maxs)
            filters["company_headcount_custom"] = headcount
    d = clean_domain(domain)
    if d:
        filters["company"] = {"websites": {"include": [d]}}
    return filters


async def person_search(*, domain: str = "", titles=None, locations=None,
                         industries=None, company_sizes=None, seniority=None,
                         include_mobile: bool = False,
                         limit: int = 25) -> List[Dict[str, Any]]:
    """Search Prospeo by titles, location, industry, domain, company size, etc."""
    filters = _build_prospeo_filters(
        domain=domain, titles=titles, locations=locations,
        industries=industries, company_sizes=company_sizes,
        seniority=seniority,
    )
    if not filters:
        return []

    if PROSPEO_MOCKED:
        d = clean_domain(domain) or "example.com"
        return _mock_domain_search(d, limit)

    return await _search_and_enrich(
        filters, clean_domain(domain) or "prospeo", limit,
        include_mobile=include_mobile,
    )


async def domain_search(domain: str, limit: int = 20) -> List[Dict[str, Any]]:
    d = clean_domain(domain)
    if not d:
        raise ValueError("a company domain is required")
    return await person_search(domain=d, limit=limit)


async def email_finder(first_name: str, last_name: str, domain: str) -> Optional[str]:
    d = clean_domain(domain)
    if PROSPEO_MOCKED:
        return f"{first_name.lower()}.{last_name.lower()}@{d}"
    data = await _request(
        "prospeo", "POST", f"{PROSPEO_BASE}/enrich-person",
        headers=_PROSPEO_HEADERS,
        json={"data": {"first_name": first_name, "last_name": last_name, "company_website": d}},
    )
    return _extract_email((data.get("person") or {}).get("email")) or None


# ── Icypeas ────────────────────────────────────────────────────────────

def _syntax_ok(email: str) -> bool:
    return bool(EMAIL_RE.match(email or "")) and not any(c in email for c in " ,;")


_ICYPEAS_HEADERS = {"Authorization": ICYPEAS_API_KEY, "Content-Type": "application/json"}

# Terminal statuses for Icypeas email verification (async flow).
# NONE/SCHEDULED/IN_PROGRESS mean keep polling.
_ICYPEAS_DONE = {"FOUND", "DEBITED", "NOT_FOUND", "DEBITED_NOT_FOUND",
                 "BAD_INPUT", "ABORTED", "INSUFFICIENT_FUNDS"}


async def _icypeas_poll(item_id: str, *, attempts: int = 8,
                        interval: float = 2.0) -> Dict[str, Any]:
    item: Dict[str, Any] = {}
    async with httpx.AsyncClient(timeout=30) as client:
        for _ in range(attempts):
            await asyncio.sleep(interval)
            r = await client.post(
                f"{ICYPEAS_BASE}/bulk-single-searchs/read",
                headers=_ICYPEAS_HEADERS, json={"id": item_id},
            )
            if r.status_code >= 400:
                raise ProviderError("icypeas", f"HTTP {r.status_code}: {r.text[:200]}",
                                    r.status_code)
            items = r.json().get("items") or []
            item = items[0] if items else {}
            if item.get("status") in _ICYPEAS_DONE:
                return item
    return item


async def verify_email(email: str) -> Dict[str, Any]:
    """Deliverability check via Icypeas (async flow)."""
    if ICYPEAS_MOCKED:
        ok = _syntax_ok(email)
        return {"status": "valid" if ok else "invalid",
                "score": 0.9 if ok else 0.0, "provider": "syntax_only", "mocked": True}

    # Try the sync endpoint first (returns immediately on some plans)
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            sr = await client.post(
                f"{ICYPEAS_BASE}/sync/email-verification",
                headers=_ICYPEAS_HEADERS, json={"email": email},
            )
            if sr.status_code == 200:
                body = sr.json()
                status = body.get("status", "")
                if status in ("VALID", "FOUND"):
                    return {"status": "valid", "score": 0.9,
                            "provider": "icypeas", "mocked": False}
                if status in ("INVALID", "NOT_FOUND"):
                    return {"status": "invalid", "score": 0.1,
                            "provider": "icypeas", "mocked": False}
        except Exception:
            pass  # sync endpoint may not be available — fall through to async

    # Async flow
    async with _CONCURRENCY:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{ICYPEAS_BASE}/email-verification",
                headers=_ICYPEAS_HEADERS, json={"email": email},
            )
        if r.status_code >= 400:
            raise ProviderError("icypeas", f"HTTP {r.status_code}: {r.text[:200]}",
                                r.status_code)
        item_id = (r.json().get("item") or {}).get("_id")
        if not item_id:
            raise ProviderError("icypeas", "no search item id returned")

    result = await _icypeas_poll(item_id)
    status = result.get("status") or ""
    if status == "INSUFFICIENT_FUNDS":
        raise ProviderError("icypeas", "account out of credits")
    if status in ("FOUND", "DEBITED"):
        return {"status": "valid", "score": 0.9, "provider": "icypeas", "mocked": False}
    if status in ("NOT_FOUND", "DEBITED_NOT_FOUND", "BAD_INPUT", "ABORTED"):
        return {"status": "invalid", "score": 0.1, "provider": "icypeas", "mocked": False}
    return {"status": "risky", "score": 0.5, "provider": "icypeas", "mocked": False}


async def verify_many(emails: List[str]) -> List[Dict[str, Any]]:
    async def _safe(e: str) -> Dict[str, Any]:
        try:
            return await verify_email(e)
        except ProviderError:
            return {"status": "risky", "score": 0.5, "provider": "error"}
    return await asyncio.gather(*(_safe(e) for e in emails))


def provider_status() -> Dict[str, str]:
    return {
        "prospeo": "test_mode" if PROSPEO_MOCKED else "live",
        "icypeas": "test_mode" if ICYPEAS_MOCKED else "live",
    }
