"""Provider adapter interface — every lead provider must implement this."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple
from .schema import (
    UnifiedSearchFilters, SearchResult, LeadRecord, LeadPerson, LeadCompany, LeadContact,
    ProviderCapabilities, ProviderStatus, CreditEstimate,
)


class LeadProviderAdapter(ABC):
    """Interface every lead provider adapter must implement."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (e.g. 'prospeo', 'icypeas', 'apollo')."""

    @abstractmethod
    async def search_people(self, filters: UnifiedSearchFilters) -> SearchResult:
        """Search for people matching the given filters."""

    @abstractmethod
    async def search_companies(self, filters: UnifiedSearchFilters) -> SearchResult:
        """Search for companies matching the given filters."""

    @abstractmethod
    async def enrich_lead(self, lead: LeadRecord) -> LeadRecord:
        """Enrich an existing lead with additional data."""

    @abstractmethod
    async def reveal_email(self, lead: LeadRecord) -> Tuple[LeadRecord, int]:
        """Reveal email for a lead. Returns (updated_lead, credits_consumed)."""

    @abstractmethod
    async def reveal_phone(self, lead: LeadRecord) -> Tuple[LeadRecord, int]:
        """Reveal phone number for a lead. Returns (updated_lead, credits_consumed)."""

    @abstractmethod
    async def reveal_lead(self, lead: LeadRecord, reveal_email: bool = True,
                          reveal_phone: bool = True) -> Tuple[LeadRecord, int]:
        """Reveal email and/or phone. Returns (updated_lead, credits_consumed)."""

    @abstractmethod
    async def verify_email(self, email: str) -> Dict[str, Any]:
        """Verify a single email address. Returns dict with status, score."""

    @abstractmethod
    async def verify_emails(self, emails: List[str]) -> List[Dict[str, Any]]:
        """Verify multiple email addresses."""

    @abstractmethod
    def available_filters(self) -> List[Dict[str, Any]]:
        """Return the list of filters this provider supports."""

    @abstractmethod
    def get_capabilities(self) -> ProviderCapabilities:
        """Return what this provider can do."""

    @abstractmethod
    async def estimate_credits(self, action: str, units: int = 1) -> int:
        """Estimate credits needed for a given action."""

    @abstractmethod
    async def get_remaining_credits(self) -> int:
        """Check remaining credits with this provider."""

    @abstractmethod
    async def get_status(self) -> ProviderStatus:
        """Check provider health and status."""


class NormalizedLeadMapper:
    """Maps raw provider responses to unified LeadRecord schema."""

    @staticmethod
    def to_location(raw: Any) -> "LeadLocation":
        from .schema import LeadLocation
        if not raw or not isinstance(raw, dict):
            return LeadLocation()
        return LeadLocation(
            country=str(raw.get("country") or ""),
            state=str(raw.get("state") or ""),
            city=str(raw.get("city") or ""),
            zip=str(raw.get("zip") or raw.get("postal_code") or ""),
            region=str(raw.get("region") or ""),
            timezone=str(raw.get("time_zone") or raw.get("timezone") or ""),
        )

    @staticmethod
    def to_company(raw: Any) -> "LeadCompany":
        from .schema import LeadCompany
        if not raw or not isinstance(raw, dict):
            return LeadCompany()
        return LeadCompany(
            name=str(raw.get("name") or ""),
            domain=str(raw.get("domain") or ""),
            website=str(raw.get("website") or raw.get("company_website") or ""),
            industry=str(raw.get("industry") or ""),
            employee_count=int(raw.get("employee_count") or 0),
            employee_range=str(raw.get("employee_range") or ""),
            annual_revenue=str(raw.get("revenue_range_printed") or raw.get("annual_revenue") or ""),
            funding_stage=str(raw.get("funding_stage") or ""),
            company_type=str(raw.get("type") or ""),
            technologies=raw.get("technology_names") or raw.get("technologies") or [],
            founded_year=raw.get("founded"),
            linkedin_url=str(raw.get("linkedin_url") or ""),
            logo_url=str(raw.get("logo_url") or ""),
            description=str(raw.get("description_ai") or raw.get("description") or ""),
            hq_location=NormalizedLeadMapper.to_location(raw.get("hq_location") or raw.get("location")),
        )
