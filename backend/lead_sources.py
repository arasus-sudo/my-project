"""Lead sourcing + email verification — typed provider clients.

Replaces the inline Prospeo/Icypeas calls that lived in server.py. Two things
change beyond the move:

1. **A failing real provider now raises.** The old code caught every exception and
   returned mock people while still reporting `providers.prospeo: "live"` — so a
   revoked key, a quota wall, or a 500 all looked like a successful search with
   ten fictional prospects. That is the worst possible failure mode for a lead
   tool: you'd email people who don't exist. Mock data is now returned *only*
   when there is no key at all (the deliberate, advertised test mode).

2. **Retry + rate limiting.** Every call goes through `_request()`, which retries
   429/5xx with exponential backoff and caps concurrency, so a burst of
   verifications can't hammer the provider.
"""

import os
import re
import asyncio
import logging
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger(__name__)

PROSPEO_API_KEY = os.environ.get("PROSPEO_API_KEY", "")
# Icypeas' REST API authenticates with the raw API key only (Authorization: <key>,
# no "Bearer" prefix, no account/user id) — verified against api-doc.icypeas.com's
# own curl example. ICYPEAS_API_SECRET isn't used by the endpoints this module
# calls; kept as an env var only in case a future bulk/webhook endpoint needs it.
ICYPEAS_API_KEY = os.environ.get("ICYPEAS_API_KEY", "")
ICYPEAS_API_SECRET = os.environ.get("ICYPEAS_API_SECRET", "")

PROSPEO_BASE = "https://api.prospeo.io"
ICYPEAS_BASE = "https://app.icypeas.com/api"

PROSPEO_MOCKED = not bool(PROSPEO_API_KEY)
ICYPEAS_MOCKED = not bool(ICYPEAS_API_KEY)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")

# Providers meter per call; don't let a 50-lead verify open 50 sockets at once.
_CONCURRENCY = asyncio.Semaphore(5)


class ProviderError(RuntimeError):
    """A real provider call failed. Surfaced to the caller — never silently
    downgraded to mock data."""

    def __init__(self, provider: str, message: str, status: Optional[int] = None):
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.status = status


async def _request(provider: str, method: str, url: str, *, headers: Dict[str, str],
                    json: Dict[str, Any], attempts: int = 3) -> Dict[str, Any]:
    """One HTTP call with backoff on 429/5xx. Raises ProviderError on give-up."""
    delay = 1.0
    last = ""
    for attempt in range(1, attempts + 1):
        try:
            async with _CONCURRENCY:
                async with httpx.AsyncClient(timeout=15) as client:
                    r = await client.request(method, url, headers=headers, json=json)
            if r.status_code == 429 or r.status_code >= 500:
                last = f"HTTP {r.status_code}"
                if attempt < attempts:
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                raise ProviderError(provider, f"{last} after {attempts} attempts", r.status_code)
            if r.status_code >= 400:
                # 401/403/422 won't fix themselves — fail immediately and loudly.
                raise ProviderError(provider, f"HTTP {r.status_code}: {r.text[:200]}", r.status_code)
            return r.json()
        except httpx.HTTPError as ex:
            last = str(ex)
            if attempt < attempts:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            raise ProviderError(provider, f"network error: {last}")
    raise ProviderError(provider, last or "unknown error")


# ----------------------------- Normalisation ---------------------------------
def _extract_email(val: Any) -> str:
    """Prospeo's `person.email` shape differs between endpoints — a plain
    string on some, `{"email": "..."}` on others. Masked previews
    ("eoghan.*****@intercom.com") mean the caller didn't actually pay to
    reveal it; treat those as no email."""
    email = val.get("email") if isinstance(val, dict) else val
    email = (email or "").strip()
    return "" if "*" in email else email


def normalize_prospect(person: Dict[str, Any], domain: str, company: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    company = company or {}
    name = person.get("name") or person.get("full_name") or ""
    first = person.get("first_name") or (name.split(" ", 1)[0] if name else "")
    last = person.get("last_name") or (name.split(" ", 1)[-1] if " " in name else "")
    title = (person.get("job_title") or person.get("current_job_title")
             or (person.get("current_job") or {}).get("job_title") or "")
    return {
        "first_name": first,
        "last_name": last,
        "email": _extract_email(person.get("email")).lower(),
        "title": title,
        "company": company.get("name") or domain.split(".")[0].title(),
        "domain": domain,
        "linkedin_url": person.get("linkedin_url") or "",
        "source": "prospeo",
        "confidence": 0.85,
    }


# ----------------------------- Mock (test mode only) ---------------------------
_MOCK_NAMES = [
    ("Alex", "Rivera", "VP Sales"), ("Priya", "Shah", "Head of Growth"),
    ("Marcus", "Chen", "Founder"), ("Sofia", "Nunez", "Director of RevOps"),
    ("Daniel", "Okafor", "CTO"), ("Emma", "Whitfield", "Marketing Lead"),
    ("Ravi", "Menon", "COO"), ("Jules", "Beaumont", "Head of Sales"),
    ("Kenji", "Tanaka", "VP Product"), ("Ines", "Costa", "Head of Marketing"),
]


def _mock_domain_search(domain: str, limit: int) -> List[Dict[str, Any]]:
    d = clean_domain(domain) or "example.com"
    company = d.split(".")[0].title()
    slug = d.split(".")[0]
    return [{
        "first_name": fn, "last_name": ln, "title": title,
        "email": f"{fn.lower()}.{ln.lower()}@{d}",
        "company": company, "domain": d,
        # Namespaced by domain: two different companies must not produce the same
        # LinkedIn URL, or the (correct) dedupe-on-linkedin_url rule would treat
        # them as the same person.
        "linkedin_url": f"https://linkedin.com/in/{fn.lower()}-{ln.lower()}-{slug}",
        "source": "prospeo", "confidence": 0.5, "mocked": True,
    } for fn, ln, title in _MOCK_NAMES[:limit]]


def clean_domain(domain: Optional[str]) -> str:
    if not domain:
        return ""
    d = domain.strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = d.split("/")[0]
    return d[4:] if d.startswith("www.") else d


# ----------------------------- Prospeo ----------------------------------------
# Prospeo retired the old single-call `/domain-search` + `/email-finder` pair —
# calling them now returns HTTP 400 "DEPRECATED". The current model is
# search-then-enrich: `/search-person` finds people at a company but masks
# contact info, `/bulk-enrich-person` spends credits to reveal verified emails
# for a batch of person_ids from that search (only charged for matches).
_PROSPEO_HEADERS = {"X-KEY": PROSPEO_API_KEY, "Content-Type": "application/json"}


async def domain_search(domain: str, limit: int = 20) -> List[Dict[str, Any]]:
    """People at a company domain. Raises ProviderError if a real call fails."""
    d = clean_domain(domain)
    if not d:
        raise ValueError("a company domain is required")

    if PROSPEO_MOCKED:
        return _mock_domain_search(d, limit)

    search_data = await _request(
        "prospeo", "POST", f"{PROSPEO_BASE}/search-person",
        headers=_PROSPEO_HEADERS,
        json={"page": 1, "filters": {"company": {"websites": {"include": [d]}}}},
    )
    hits = search_data.get("results") or []
    ids = [(h.get("person") or {}).get("person_id") for h in hits[:limit]]
    ids = [pid for pid in ids if pid]
    if not ids:
        return []

    enrich_data = await _request(
        "prospeo", "POST", f"{PROSPEO_BASE}/bulk-enrich-person",
        headers=_PROSPEO_HEADERS,
        json={"only_verified_email": True,
              "data": [{"identifier": pid, "person_id": pid} for pid in ids]},
    )
    matched = enrich_data.get("matched") or []
    out = [normalize_prospect(m.get("person") or {}, d, m.get("company")) for m in matched]
    return [p for p in out if p["email"]][:limit]


async def email_finder(first_name: str, last_name: str, domain: str) -> Optional[str]:
    """Guess-and-verify a single person's address."""
    d = clean_domain(domain)
    if PROSPEO_MOCKED:
        return f"{first_name.lower()}.{last_name.lower()}@{d}"
    data = await _request(
        "prospeo", "POST", f"{PROSPEO_BASE}/enrich-person",
        headers=_PROSPEO_HEADERS,
        json={"data": {"first_name": first_name, "last_name": last_name, "company_website": d}},
    )
    return _extract_email((data.get("person") or {}).get("email")) or None


# ----------------------------- Icypeas ----------------------------------------
def _syntax_ok(email: str) -> bool:
    return bool(EMAIL_RE.match(email or "")) and not any(c in email for c in " ,;")


_ICYPEAS_HEADERS = {"Authorization": ICYPEAS_API_KEY, "Content-Type": "application/json"}
# email-verification is async: the POST just queues a "search item" and returns
# its _id; the real result (found/not-found) only shows up once you poll
# bulk-single-searchs/read for that id. These are the terminal statuses —
# NONE/SCHEDULED/IN_PROGRESS mean "keep polling."
_ICYPEAS_DONE = {"FOUND", "DEBITED", "NOT_FOUND", "DEBITED_NOT_FOUND", "BAD_INPUT", "ABORTED", "INSUFFICIENT_FUNDS"}


async def _icypeas_poll(item_id: str, *, attempts: int = 8, interval: float = 2.0) -> Dict[str, Any]:
    item: Dict[str, Any] = {}
    async with httpx.AsyncClient(timeout=15) as client:
        for _ in range(attempts):
            await asyncio.sleep(interval)
            r = await client.post(f"{ICYPEAS_BASE}/bulk-single-searchs/read",
                                   headers=_ICYPEAS_HEADERS, json={"id": item_id})
            if r.status_code >= 400:
                raise ProviderError("icypeas", f"HTTP {r.status_code}: {r.text[:200]}", r.status_code)
            items = r.json().get("items") or []
            item = items[0] if items else {}
            if item.get("status") in _ICYPEAS_DONE:
                return item
    return item  # still processing after our poll budget — caller treats as inconclusive


async def verify_email(email: str) -> Dict[str, Any]:
    """Deliverability check. In test mode this is a syntax screen and says so."""
    if ICYPEAS_MOCKED:
        ok = _syntax_ok(email)
        return {"status": "valid" if ok else "invalid",
                "score": 0.9 if ok else 0.0, "provider": "syntax_only", "mocked": True}

    async with _CONCURRENCY:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{ICYPEAS_BASE}/email-verification",
                                   headers=_ICYPEAS_HEADERS, json={"email": email})
        if r.status_code >= 400:
            raise ProviderError("icypeas", f"HTTP {r.status_code}: {r.text[:200]}", r.status_code)
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
    # Timed out still mid-processing — inconclusive, not a hard failure.
    return {"status": "risky", "score": 0.5, "provider": "icypeas", "mocked": False}


async def verify_many(emails: List[str]) -> List[Dict[str, Any]]:
    """Verify concurrently (bounded by the semaphore) rather than one at a time —
    the old code did N sequential HTTP calls inside the request handler."""
    return await asyncio.gather(*(verify_email(e) for e in emails))


def provider_status() -> Dict[str, str]:
    return {
        "prospeo": "test_mode" if PROSPEO_MOCKED else "live",
        "icypeas": "test_mode" if ICYPEAS_MOCKED else "live",
    }
