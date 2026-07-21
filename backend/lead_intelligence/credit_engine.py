"""Unified credit management engine — abstracts provider billing into one model."""
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from .schema import CreditEstimate, CreditTransaction


# Internal credit costs (abstract — not provider-specific).
# These map to the billing.CREDIT_COSTS system already in place.
CREDIT_COST_MAP: Dict[str, int] = {
    "lead.search": 5,
    "lead.reveal_email": 5,
    "lead.reveal_phone": 10,
    "lead.reveal_both": 12,  # email + phone bundled saves 3
    "lead.enrich": 5,
    "email.verify": 1,
    "email.bulk_verify": 1,
    "company.search": 3,
    "company.enrich": 5,
}


class CreditEngine:
    """Unified credit engine — single model regardless of provider billing system.

    Delegates actual balance checks/deductions to the workspace-level billing
    module (`billing.check_credits` / `billing.charge_credits`).
    """

    def __init__(self, db=None, billing_module=None):
        self._db = db
        self._billing = billing_module

    async def check_credits(self, workspace_id: str, action: str,
                            units: int = 1) -> bool:
        """Check if workspace has enough credits for an action without deducting."""
        cost = CREDIT_COST_MAP.get(action, 5) * max(1, units)
        if self._billing:
            try:
                from billing import check_credits as bc
                await bc(workspace_id, action, units)
                return True
            except Exception:
                return False
        return True

    async def charge(self, workspace_id: str, user_id: str, action: str,
                     units: int = 1, *, provider: str = "",
                     allow_overdraft: bool = False,
                     metadata: Optional[Dict[str, Any]] = None) -> Tuple[int, int]:
        """Charge credits for an action. Returns (cost, balance_after)."""
        cost = CREDIT_COST_MAP.get(action, 5) * max(1, units)
        if self._billing and cost > 0:
            from billing import charge_credits as cc
            balance = await cc(workspace_id, action, units=units,
                                allow_overdraft=allow_overdraft,
                                meta=metadata)
        else:
            balance = 999999
        return cost, balance

    async def estimate(self, action: str, units: int = 1) -> int:
        """Return estimated credit cost without checking balance."""
        return CREDIT_COST_MAP.get(action, 5) * max(1, units)

    async def estimate_search(self, filters: Dict[str, Any],
                               providers: List[str]) -> CreditEstimate:
        """Estimate full cost of a search across providers."""
        base_cost = CREDIT_COST_MAP.get("lead.search", 5)
        reveal_cost = 0
        if filters.get("has_verified_email") or filters.get("verify_emails"):
            reveal_cost += CREDIT_COST_MAP.get("email.verify", 1) * 25
        if filters.get("has_mobile") or filters.get("enrich_contacts"):
            reveal_cost += CREDIT_COST_MAP.get("lead.reveal_phone", 10) * 25

        total = base_cost + reveal_cost
        return CreditEstimate(
            estimated_cost=total,
            credits_available=999999,
            sufficient=True,
            breakdown={
                "search": base_cost,
                "verification": reveal_cost,
            },
        )

    async def get_history(self, workspace_id: str, limit: int = 50) -> List[CreditTransaction]:
        if self._db is not None:
            cursor = self._db.credit_ledger.find(
                {"workspace_id": workspace_id},
                {"_id": 0},
            ).sort("_ts", -1).limit(limit)
            docs = await cursor.to_list(limit)
            return [CreditTransaction(**d) for d in docs]
        return []
