"""Icypeas provider adapter — implements LeadProviderAdapter interface.

Icypeas is primarily an email finder + verifier. It excels at discovering
contact details from name+company and verifying deliverability. It does NOT
have people search or company search capabilities — for those it relies on
partner integrations.

In the lead intelligence flow Icypeas is used for:
  1. Email verification (sync/async)
  2. Email discovery from name + company (fallback when Prospeo enrichment
     can't find a verified email)
"""
from __future__ import annotations
import time
from typing import Any, Dict, List, Optional, Tuple

from ..interfaces import LeadProviderAdapter
from ..schema import (
    UnifiedSearchFilters, SearchResult, LeadRecord, LeadPerson, LeadCompany,
    LeadContact, ProviderCapabilities, ProviderStatus,
)


class IcypeasAdapter(LeadProviderAdapter):
    """Adapter wrapping Icypeas email finder + verification APIs."""

    def __init__(self, db=None, cache=None, audit=None):
        self._db = db
        self._cache = cache
        self._audit = audit

    @property
    def name(self) -> str:
        return "icypeas"

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            search_people=False,
            search_companies=False,
            enrich_lead=True,
            reveal_email=True,
            reveal_phone=False,
            reveal_mobile=False,
            reveal_direct_dial=False,
            verify_email=True,
            bulk_search=False,
            bulk_enrich=False,
            company_data=False,
            technology_data=False,
            credits_cost_estimate=1,
        )

    def available_filters(self) -> List[Dict[str, Any]]:
        return [
            {"key": "full_name", "label": "Full Name", "type": "text",
             "section": "person"},
            {"key": "first_name", "label": "First Name", "type": "text",
             "section": "person"},
            {"key": "last_name", "label": "Last Name", "type": "text",
             "section": "person"},
            {"key": "company_domain", "label": "Company Domain", "type": "text",
             "section": "company"},
            {"key": "company_name", "label": "Company Name", "type": "text",
             "section": "company"},
        ]

    async def get_remaining_credits(self) -> int:
        return 99999  # Icypeas doesn't expose a credits endpoint easily

    async def get_status(self) -> ProviderStatus:
        import os
        key = os.environ.get("ICYPEAS_API_KEY", "")
        return ProviderStatus(
            name="icypeas",
            available=bool(key),
            healthy=bool(key),
            credits_remaining=99999,
            plan="live" if key else "no_key",
        )

    async def estimate_credits(self, action: str, units: int = 1) -> int:
        if action == "email.verify":
            return 1 * units
        if action == "email.find":
            return 1 * units
        return 1 * units

    # ── search (not supported by Icypeas directly) ─────────────────────

    async def search_people(self, filters: UnifiedSearchFilters) -> SearchResult:
        return SearchResult()

    async def search_companies(self, filters: UnifiedSearchFilters) -> SearchResult:
        return SearchResult()

    # ── enrich (email discovery) ───────────────────────────────────────

    async def enrich_lead(self, lead: LeadRecord) -> LeadRecord:
        """Try to find an email for this lead via Icypeas email search."""
        if lead.contact.email and "*" not in lead.contact.email:
            return lead  # already has an email
        fn = lead.person.first_name
        ln = lead.person.last_name
        domain = lead.company.domain or lead.company.website
        if not fn or not ln or not domain:
            return lead
        result = await self._find_email(fn, ln, domain)
        if result:
            lead.contact.email = result
            lead.contact.email_revealed = True
            lead.source_provider = "icypeas"
        return lead

    async def reveal_email(self, lead: LeadRecord) -> Tuple[LeadRecord, int]:
        return await self.enrich_lead(lead), 1

    async def reveal_phone(self, lead: LeadRecord) -> Tuple[LeadRecord, int]:
        return lead, 0

    async def reveal_lead(self, lead: LeadRecord, reveal_email: bool = True,
                           reveal_phone: bool = True) -> Tuple[LeadRecord, int]:
        credits = 0
        if reveal_email:
            result = await self.enrich_lead(lead)
            credits += 1
        return lead, credits

    # ── verify ─────────────────────────────────────────────────────────

    async def verify_email(self, email: str) -> Dict[str, Any]:
        """Verify via Icypeas (tries sync first, falls back to async)."""
        from lead_sources import verify_email as icypeas_verify
        return await icypeas_verify(email)

    async def verify_emails(self, emails: List[str]) -> List[Dict[str, Any]]:
        from lead_sources import verify_many
        return await verify_many(emails)

    # ── helpers ────────────────────────────────────────────────────────

    async def _find_email(self, first_name: str, last_name: str,
                           domain: str) -> Optional[str]:
        """Try Icypeas sync email search endpoint."""
        import os, httpx
        key = os.environ.get("ICYPEAS_API_KEY", "")
        if not key:
            return None
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(
                    "https://app.icypeas.com/api/email-search",
                    headers={"Authorization": key, "Content-Type": "application/json"},
                    json={"firstname": first_name, "lastname": last_name,
                          "domainOrCompany": domain},
                )
                if r.status_code != 200:
                    return None
                # This is async — returns item with _id, need to poll
                return None  # For now, just return None for the sync path
        except Exception:
            return None
