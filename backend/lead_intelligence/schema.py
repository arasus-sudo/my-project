"""Unified data schema for Lead Intelligence — provider-agnostic models."""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────

SeniorityLevel = Literal[
    "C-Suite", "Vice President", "Director", "Senior", "Mid-Level", "Entry", "Intern", "Founder/Owner", "Partner"
]
Department = Literal[
    "Sales", "Marketing", "Engineering & Technical", "Finance", "HR",
    "Operations", "Product", "Legal", "Design", "Support", "Chief Executive", "Founder"
]
VerificationStatus = Literal["valid", "invalid", "risky", "catch_all", "disposable", "unknown", "temporary"]
RevealStatus = Literal["masked", "revealed", "not_available"]
EnrichmentStatus = Literal["none", "enriched", "partial", "failed"]
ConfidenceScore = Literal["high", "medium", "low"]
FundingStage = Literal[
    "Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E+",
    "Public", "Acquired", "Bootstrapped", "Corporate Venture", "Grant"
]


# ── Unified Filters ────────────────────────────────────────────────────

class UnifiedSearchFilters(BaseModel):
    keywords: Optional[str] = None
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    job_titles: Optional[List[str]] = None
    departments: Optional[List[str]] = None
    seniority: Optional[List[str]] = None
    management_level: Optional[List[str]] = None
    role: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    years_experience_min: Optional[int] = None
    years_experience_max: Optional[int] = None
    education: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    linkedin_url: Optional[str] = None

    company_name: Optional[str] = None
    company_domain: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[List[str]] = None
    sub_industry: Optional[List[str]] = None
    employee_count_min: Optional[int] = None
    employee_count_max: Optional[int] = None
    annual_revenue_min: Optional[int] = None
    annual_revenue_max: Optional[int] = None
    funding_stage: Optional[List[str]] = None
    funding_amount_min: Optional[int] = None
    funding_amount_max: Optional[int] = None
    company_type: Optional[List[str]] = None  # public, private, non-profit
    technologies: Optional[List[str]] = None
    hiring_status: Optional[bool] = None
    company_growth: Optional[bool] = None
    recently_funded: Optional[bool] = None
    intent_signals: Optional[bool] = None
    founded_year_min: Optional[int] = None
    founded_year_max: Optional[int] = None
    company_headquarters: Optional[str] = None

    country: Optional[List[str]] = None
    state: Optional[List[str]] = None
    city: Optional[List[str]] = None
    zip_code: Optional[List[str]] = None
    region: Optional[List[str]] = None
    timezone: Optional[List[str]] = None

    has_verified_email: Optional[bool] = None
    has_mobile: Optional[bool] = None
    has_direct_dial: Optional[bool] = None
    has_linkedin: Optional[bool] = None
    has_work_email: Optional[bool] = None
    has_personal_email: Optional[bool] = None
    enrich_contacts: Optional[bool] = None
    verify_emails: Optional[bool] = None

    page: int = 1
    page_size: int = 25
    max_results: Optional[int] = None

    # AI natural language query
    natural_query: Optional[str] = None


class UnifiedFilterDefinition(BaseModel):
    """Describes a filter for the UI to render dynamically."""
    key: str
    label: str
    type: Literal["text", "multiselect", "range", "boolean", "enum"]
    options: Optional[List[str]] = None
    placeholder: Optional[str] = None
    section: str = "general"  # person, company, location, contact


# ── Unified Lead Schema ────────────────────────────────────────────────

class LeadLocation(BaseModel):
    country: str = ""
    state: str = ""
    city: str = ""
    zip: str = ""
    region: str = ""
    timezone: str = ""


class LeadCompany(BaseModel):
    name: str = ""
    domain: str = ""
    website: str = ""
    industry: str = ""
    sub_industry: str = ""
    employee_count: int = 0
    employee_range: str = ""
    annual_revenue: Optional[str] = None
    funding_stage: Optional[str] = None
    funding_total: Optional[str] = None
    company_type: str = ""  # public / private / non-profit
    technologies: List[str] = []
    founded_year: Optional[int] = None
    linkedin_url: str = ""
    logo_url: str = ""
    description: str = ""
    hq_location: LeadLocation = Field(default_factory=LeadLocation)
    naics_codes: List[str] = []
    sic_codes: List[str] = []


class LeadContact(BaseModel):
    email: str = ""
    email_status: VerificationStatus = "unknown"
    email_revealed: bool = False
    phone: str = ""
    phone_status: VerificationStatus = "unknown"
    phone_revealed: bool = False
    direct_dial: str = ""
    direct_dial_revealed: bool = False
    work_email: str = ""
    personal_email: str = ""
    linkedin_url: str = ""
    linkedin_revealed: bool = False


class LeadPerson(BaseModel):
    first_name: str = ""
    last_name: str = ""
    full_name: str = ""
    title: str = ""
    headline: str = ""
    seniority: str = ""
    department: str = ""
    management_level: str = ""
    skills: List[str] = []
    years_experience: int = 0
    education: List[Dict[str, Any]] = []
    languages: List[str] = []
    location: LeadLocation = Field(default_factory=LeadLocation)
    avatar_url: str = ""


class LeadRecord(BaseModel):
    id: str = ""
    person: LeadPerson = Field(default_factory=LeadPerson)
    company: LeadCompany = Field(default_factory=LeadCompany)
    contact: LeadContact = Field(default_factory=LeadContact)

    confidence_score: float = 0.0
    lead_score: float = 0.0
    ai_score: float = 0.0

    enrichment_status: EnrichmentStatus = "none"
    verification_status: VerificationStatus = "unknown"
    source_provider: str = ""
    provider_record_id: str = ""
    provider_raw: Dict[str, Any] = Field(default_factory=dict)

    tags: List[str] = []
    owner: str = ""
    crm_status: str = "new"  # new, contacted, qualified, disqualified, converted
    import_date: Optional[str] = None
    last_updated: Optional[str] = None

    duplicate_group: Optional[str] = None
    is_duplicate: bool = False


class SearchResult(BaseModel):
    leads: List[LeadRecord] = []
    total_estimated: int = 0
    total_returned: int = 0
    page: int = 1
    page_size: int = 25
    has_more: bool = False
    estimated_credits: int = 0
    processing_time_ms: int = 0
    providers_used: List[str] = []
    cached: bool = False
    search_id: str = ""
    parsed_filters: Optional[Dict[str, Any]] = None  # AI-parsed NL filters


# ── Credit Models ──────────────────────────────────────────────────────

class CreditEstimate(BaseModel):
    estimated_cost: int = 0
    credits_available: int = 0
    sufficient: bool = False
    breakdown: Dict[str, int] = Field(default_factory=dict)  # action -> cost


class CreditTransaction(BaseModel):
    id: str = ""
    workspace_id: str = ""
    user_id: str = ""
    action: str = ""
    units: int = 0
    cost: int = 0
    provider: str = ""
    balance_before: int = 0
    balance_after: int = 0
    timestamp: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ── Reveal Models ──────────────────────────────────────────────────────

class RevealRequest(BaseModel):
    lead_ids: List[str]
    reveal_email: bool = False
    reveal_phone: bool = False
    reveal_both: bool = False


class RevealResult(BaseModel):
    lead_id: str = ""
    email: str = ""
    phone: str = ""
    direct_dial: str = ""
    email_revealed: bool = False
    phone_revealed: bool = False
    credits_consumed: int = 0
    success: bool = False
    error: str = ""


class RevealCostEstimate(BaseModel):
    total_credits: int = 0
    per_lead: int = 0
    leads_requested: int = 0
    leads_already_revealed: int = 0


# ── Provider Capabilities ──────────────────────────────────────────────

class ProviderCapabilities(BaseModel):
    search_people: bool = False
    search_companies: bool = False
    enrich_lead: bool = False
    reveal_email: bool = False
    reveal_phone: bool = False
    reveal_mobile: bool = False
    reveal_direct_dial: bool = False
    verify_email: bool = False
    bulk_search: bool = False
    bulk_enrich: bool = False
    company_data: bool = False
    technology_data: bool = False
    intent_signals: bool = False
    credits_cost_estimate: int = 0  # default cost per action


class ProviderStatus(BaseModel):
    name: str = ""
    available: bool = False
    healthy: bool = False
    credits_remaining: int = 0
    credits_used: int = 0
    plan: str = ""
    latency_ms: float = 0.0
    error_rate: float = 0.0
    last_check: str = ""
