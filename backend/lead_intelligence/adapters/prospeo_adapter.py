"""Prospeo provider adapter — implements LeadProviderAdapter interface."""
from __future__ import annotations
import time
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from ..interfaces import LeadProviderAdapter, NormalizedLeadMapper
from ..schema import (
    UnifiedSearchFilters, SearchResult, LeadRecord, LeadPerson, LeadCompany,
    LeadContact, LeadLocation, ProviderCapabilities, ProviderStatus, CreditEstimate,
    VerificationStatus,
)
from ..cache import LeadCache
from ..audit import AuditLogger


class ProspeoAdapter(LeadProviderAdapter):
    """Adapter wrapping Prospeo's search-person + bulk-enrich-person APIs."""

    def __init__(self, db=None, cache: Optional[LeadCache] = None,
                 audit: Optional[AuditLogger] = None):
        self._db = db
        self._cache = cache
        self._audit = audit
        self._status_cache = {"credits": 0, "last_check": 0, "ttl": 300}

    @property
    def name(self) -> str:
        return "prospeo"

    # ── capabilities ───────────────────────────────────────────────────

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            search_people=True,
            search_companies=False,
            enrich_lead=True,
            reveal_email=True,
            reveal_phone=True,
            reveal_mobile=True,
            reveal_direct_dial=False,
            verify_email=False,
            bulk_search=True,
            bulk_enrich=True,
            company_data=True,
            technology_data=True,
            intent_signals=False,
            credits_cost_estimate=5,
        )

    def available_filters(self) -> List[Dict[str, Any]]:
        return [
            {"key": "job_titles", "label": "Job Titles", "type": "multiselect",
             "section": "person", "placeholder": "e.g. CEO, VP Sales"},
            {"key": "seniority", "label": "Seniority", "type": "multiselect",
             "section": "person",
             "options": ["C-Suite", "Vice President", "Director", "Senior",
                         "Mid-Level", "Entry", "Founder/Owner", "Partner"]},
            {"key": "departments", "label": "Department", "type": "multiselect",
             "section": "person",
             "options": ["Sales", "Marketing", "Engineering & Technical",
                         "Finance", "HR", "Operations", "Product", "Legal",
                         "Design", "Support"]},
            {"key": "industry", "label": "Industry", "type": "multiselect",
             "section": "company"},
            {"key": "company_domain", "label": "Company Domain", "type": "text",
             "section": "company", "placeholder": "acme.com"},
            {"key": "employee_count_min", "label": "Min Employees", "type": "range",
             "section": "company"},
            {"key": "employee_count_max", "label": "Max Employees", "type": "range",
             "section": "company"},
            {"key": "country", "label": "Country", "type": "multiselect",
             "section": "location"},
            {"key": "state", "label": "State", "type": "multiselect",
             "section": "location"},
            {"key": "city", "label": "City", "type": "multiselect",
             "section": "location"},
            {"key": "has_verified_email", "label": "Verified Email Only",
             "type": "boolean", "section": "contact"},
            {"key": "has_mobile", "label": "Has Mobile Number", "type": "boolean",
             "section": "contact"},
            {"key": "technologies", "label": "Technologies", "type": "multiselect",
             "section": "company"},
            {"key": "funding_stage", "label": "Funding Stage", "type": "multiselect",
             "section": "company"},
        ]

    # ── status / credits ───────────────────────────────────────────────

    async def get_remaining_credits(self) -> int:
        import os
        if not os.environ.get("PROSPEO_API_KEY"):
            return 0
        now = time.time()
        if now - self._status_cache["last_check"] < self._status_cache["ttl"]:
            return self._status_cache["credits"]
        try:
            from lead_sources import _request, _PROSPEO_HEADERS, PROSPEO_BASE
            data = await _request("prospeo", "GET", f"{PROSPEO_BASE}/account-information",
                                   headers=_PROSPEO_HEADERS, json={})
            resp = data.get("response") or {}
            credits = int(resp.get("remaining_credits", 0))
            self._status_cache["credits"] = credits
            self._status_cache["last_check"] = now
            return credits
        except Exception:
            return self._status_cache.get("credits", 0)

    async def get_status(self) -> ProviderStatus:
        import os
        key = os.environ.get("PROSPEO_API_KEY", "")
        if not key:
            return ProviderStatus(name="prospeo", available=False, healthy=False,
                                  credits_remaining=0, plan="no_key")
        try:
            credits = await self.get_remaining_credits()
            return ProviderStatus(
                name="prospeo", available=True, healthy=True,
                credits_remaining=credits, plan="live",
            )
        except Exception:
            return ProviderStatus(
                name="prospeo", available=False, healthy=False,
                credits_remaining=0, plan="error",
            )

    # ── estimate credits ───────────────────────────────────────────────

    async def estimate_credits(self, action: str, units: int = 1) -> int:
        from lead_intelligence.credit_engine import CREDIT_COST_MAP
        if action == "reveal_phone":
            return 10 * units  # Prospeo charges 10 credits per mobile
        return CREDIT_COST_MAP.get(action, 5) * units

    # ── search ─────────────────────────────────────────────────────────

    async def search_people(self, filters: UnifiedSearchFilters) -> SearchResult:
        import lead_sources
        t0 = time.time()

        # Map unified filters → Prospeo-native kwargs
        titles = filters.job_titles
        locations = self._resolve_locations(filters)
        industries = filters.industry
        domain = filters.company_domain or ""
        has_mobile = filters.has_mobile
        has_verified = filters.has_verified_email

        # Build kwargs for the existing lead_sources.person_search
        kwargs: Dict[str, Any] = {
            "titles": titles,
            "locations": locations,
            "industries": industries,
            "company_sizes": self._resolve_company_sizes(filters),
            "seniority": filters.seniority,
            "domain": domain,
            "limit": filters.page_size or 25,
        }

        # Provider routing: if mobile requested, tell Prospeo to enrich mobile
        include_mobile = bool(has_mobile)
        kwargs["include_mobile"] = include_mobile

        try:
            prospects = await lead_sources.person_search(**kwargs)
        except Exception as exc:
            err_str = str(exc)
            # If Prospeo rejects industry values, retry without them
            if industries and "INVALID_FILTERS" in err_str and "industry" in err_str.lower():
                kwargs.pop("industries", None)
                try:
                    prospects = await lead_sources.person_search(**kwargs)
                except Exception as retry_exc:
                    if self._audit:
                        await self._audit.search_log(workspace_id="system", user_id="system", filters=filters.model_dump(), results_count=0, provider="prospeo", success=False, error=str(retry_exc))
                    raise
            else:
                if self._audit:
                    await self._audit.search_log(workspace_id="system", user_id="system", filters=filters.model_dump(), results_count=0, provider="prospeo", success=False, error=err_str)
                raise

        leads = [self._prospeo_to_lead(p) for p in prospects]
        elapsed = int((time.time() - t0) * 1000)

        if self._audit:
            await self._audit.search_log(
                workspace_id="system", user_id="system",
                filters=filters.model_dump(), results_count=len(leads),
                provider="prospeo",
            )

        return SearchResult(
            leads=leads,
            total_estimated=len(leads),
            total_returned=len(leads),
            page=filters.page or 1,
            page_size=filters.page_size or 25,
            has_more=False,
            estimated_credits=5,
            processing_time_ms=elapsed,
            providers_used=["prospeo"],
        )

    async def search_companies(self, filters: UnifiedSearchFilters) -> SearchResult:
        # Prospeo has a search-company endpoint — not used yet; return empty.
        return SearchResult()

    # ── enrich / reveal ────────────────────────────────────────────────

    async def enrich_lead(self, lead: LeadRecord) -> LeadRecord:
        """Enrich an existing lead with Prospeo data."""
        import lead_sources
        domain = lead.company.domain or lead.company.website
        if not domain:
            return lead
        prospects = await lead_sources.person_search(
            domain=domain,
            titles=[lead.person.title] if lead.person.title else None,
            limit=5,
        )
        if prospects:
            enriched = self._prospeo_to_lead(prospects[0])
            # Merge enriched data into original lead, preserving CRM state
            lead.person = enriched.person
            lead.company = enriched.company
            lead.confidence_score = enriched.confidence_score
            lead.enrichment_status = "enriched"
        return lead

    async def reveal_email(self, lead: LeadRecord) -> Tuple[LeadRecord, int]:
        """Reveal email via Prospeo enrich-person endpoint."""
        return await self._reveal(lead, reveal_email=True, reveal_phone=False)

    async def reveal_phone(self, lead: LeadRecord) -> Tuple[LeadRecord, int]:
        """Reveal phone via Prospeo enrich-person with enrich_mobile=true."""
        return await self._reveal(lead, reveal_email=False, reveal_phone=True)

    async def reveal_lead(self, lead: LeadRecord, reveal_email: bool = True,
                           reveal_phone: bool = True) -> Tuple[LeadRecord, int]:
        return await self._reveal(lead, reveal_email=reveal_email,
                                   reveal_phone=reveal_phone)

    async def _reveal(self, lead: LeadRecord, reveal_email: bool,
                       reveal_phone: bool) -> Tuple[LeadRecord, int]:
        """Call Prospeo enrich-person to reveal contact details."""
        import lead_sources
        credits = 0
        # Build the data payload for Prospeo enrich
        data: Dict[str, Any] = {}
        if lead.person.first_name and lead.person.last_name:
            data["first_name"] = lead.person.first_name
            data["last_name"] = lead.person.last_name
        elif lead.person.full_name:
            data["full_name"] = lead.person.full_name
        if lead.contact.linkedin_url:
            data["linkedin_url"] = lead.contact.linkedin_url
        if lead.company.domain:
            data["company_website"] = lead.company.domain
        if lead.company.name:
            data["company_name"] = lead.company.name

        # Minimum matching criteria check
        has_basic = (data.get("person_id") or data.get("email") or
                     data.get("linkedin_url") or
                     (data.get("first_name") and data.get("last_name") and
                      (data.get("company_website") or data.get("company_name"))))
        if not has_basic:
            return lead, 0

        enrich_opts: Dict[str, Any] = {"data": data}
        if reveal_phone:
            enrich_opts["enrich_mobile"] = True
            credits += 10
        if reveal_email:
            credits += 1

        try:
            result = await lead_sources._request(
                "prospeo", "POST",
                f"{lead_sources.PROSPEO_BASE}/enrich-person",
                headers=lead_sources._PROSPEO_HEADERS,
                json=enrich_opts,
            )
        except Exception:
            return lead, 0

        person_data = result.get("person") or {}
        company_data = result.get("company")

        # Update lead with revealed data
        email_obj = person_data.get("email") or {}
        mobile_obj = person_data.get("mobile") or {}

        if reveal_email:
            revealed = lead_sources._extract_email(email_obj)
            if revealed:
                lead.contact.email = revealed
                lead.contact.email_revealed = True

        if reveal_phone:
            revealed = lead_sources._extract_phone(mobile_obj)
            if revealed:
                lead.contact.phone = revealed
                lead.contact.phone_revealed = True
                lead.contact.direct_dial = revealed

        if company_data:
            lead.company = NormalizedLeadMapper.to_company(company_data)

        return lead, credits

    # ── verify ─────────────────────────────────────────────────────────

    async def verify_email(self, email: str) -> Dict[str, Any]:
        return {"status": "unknown", "score": 0.0, "provider": "prospeo"}

    async def verify_emails(self, emails: List[str]) -> List[Dict[str, Any]]:
        return [await self.verify_email(e) for e in emails]

    # ── helpers ────────────────────────────────────────────────────────

    def _prospeo_to_lead(self, raw: Dict[str, Any]) -> LeadRecord:
        """Map raw Prospeo prospect dict → unified LeadRecord."""
        return LeadRecord(
            person=LeadPerson(
                first_name=raw.get("first_name", ""),
                last_name=raw.get("last_name", ""),
                full_name=raw.get("full_name", ""),
                title=raw.get("title", ""),
                headline=raw.get("headline", ""),
                skills=raw.get("skills", []),
                location=NormalizedLeadMapper.to_location(raw.get("location")),
            ),
            company=LeadCompany(
                name=raw.get("company", ""),
                domain=raw.get("company_domain", raw.get("domain", "")),
                website=raw.get("company_website", ""),
                industry=raw.get("company_industry", ""),
                employee_range=raw.get("company_size", ""),
                description=raw.get("company_description", ""),
                logo_url=raw.get("company_logo", ""),
                linkedin_url=raw.get("company_linkedin", ""),
                technologies=raw.get("technologies", []),
            ),
            contact=LeadContact(
                email=raw.get("email", ""),
                email_revealed=bool(raw.get("email") and "*" not in raw.get("email", "")),
                phone=raw.get("phone", ""),
                phone_revealed=bool(raw.get("phone") and "*" not in raw.get("phone", "")),
                linkedin_url=raw.get("linkedin_url", ""),
            ),
            confidence_score=raw.get("confidence", 0.85),
            source_provider="prospeo",
            provider_record_id=raw.get("person_id", ""),
            provider_raw=raw,
        )

    def _resolve_locations(self, filters: UnifiedSearchFilters) -> Optional[List[str]]:
        parts = []
        if filters.country:
            parts.extend(filters.country)
        if filters.state:
            parts.extend(filters.state)
        if filters.city:
            parts.extend(filters.city)
        return parts if parts else None

    def _resolve_company_sizes(self, filters: UnifiedSearchFilters) -> Optional[List[str]]:
        if filters.employee_count_min is not None or filters.employee_count_max is not None:
            mn = filters.employee_count_min or 1
            mx = filters.employee_count_max or 50000
            return [f"{mn}-{mx}"]
        return None
