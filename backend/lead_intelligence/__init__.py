"""Lead Intelligence Module — provider-agnostic, enterprise-grade lead search.

Architecture:
  Provider Adapters  →  Provider Manager  →  Unified API  →  Frontend
  (Prospeo, Icypeas,   (routing, merging,    (search, reveal,
   future providers)     caching, failover)    enrich, verify)

Usage:
    from lead_intelligence.provider_manager import ProviderManager
    
    manager = ProviderManager(db=mongo_db)
    manager.register(ProspeoAdapter(db=mongo_db))
    manager.register(IcypeasAdapter(db=mongo_db))
    
    result = await manager.search(UnifiedSearchFilters(job_titles=["CEO"]))
"""
from .provider_manager import ProviderManager
from .schema import (
    UnifiedSearchFilters, SearchResult, LeadRecord,
    LeadPerson, LeadCompany, LeadContact, LeadLocation,
    ProviderCapabilities, ProviderStatus,
    CreditEstimate, CreditTransaction,
    RevealRequest, RevealResult, RevealCostEstimate,
)
from .interfaces import LeadProviderAdapter, NormalizedLeadMapper
from .adapters.prospeo_adapter import ProspeoAdapter
from .adapters.icypeas_adapter import IcypeasAdapter
from .cache import LeadCache
from .audit import AuditLogger
from .credit_engine import CreditEngine, CREDIT_COST_MAP

__all__ = [
    "ProviderManager",
    "UnifiedSearchFilters", "SearchResult", "LeadRecord",
    "LeadPerson", "LeadCompany", "LeadContact", "LeadLocation",
    "ProviderCapabilities", "ProviderStatus",
    "CreditEstimate", "CreditTransaction",
    "RevealRequest", "RevealResult", "RevealCostEstimate",
    "LeadProviderAdapter", "NormalizedLeadMapper",
    "ProspeoAdapter", "IcypeasAdapter",
    "LeadCache", "AuditLogger", "CreditEngine", "CREDIT_COST_MAP",
]
