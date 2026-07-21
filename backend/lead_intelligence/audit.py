"""Audit logging for all lead intelligence operations."""
from __future__ import annotations
import json
import time
from typing import Any, Dict, Optional
from datetime import datetime


class AuditLogger:
    """Centralised audit log — every search, reveal, enrich, etc. is recorded.

    Defaults to in-memory (dev/test). Wired to MongoDB via `db` for production.
    """

    def __init__(self, db=None):
        self._db = db
        self._memory: list = []

    async def log(self, *, action: str, workspace_id: str, user_id: str = "",
                   provider: str = "", entity_id: str = "", entity_type: str = "",
                   metadata: Optional[Dict[str, Any]] = None,
                   ip_address: str = "", request_id: str = "",
                   credits_consumed: int = 0, success: bool = True,
                   error: str = "") -> str:
        entry = {
            "_ts": time.time(),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "action": action,
            "workspace_id": workspace_id,
            "user_id": user_id,
            "provider": provider,
            "entity_id": entity_id,
            "entity_type": entity_type,
            "metadata": metadata or {},
            "ip_address": ip_address,
            "request_id": request_id,
            "credits_consumed": credits_consumed,
            "success": success,
            "error": error,
        }
        if self._db is not None:
            r = await self._db.lead_audit_log.insert_one(entry)
            entry["_id"] = str(r.inserted_id)
        else:
            self._memory.append(entry)
        return entry.get("_id", "")

    async def search_log(self, *, workspace_id: str, user_id: str,
                          filters: Dict[str, Any], results_count: int,
                          provider: str, credits: int = 0, request_id: str = "",
                          success: bool = True, error: str = "") -> str:
        return await self.log(
            action="lead.search",
            workspace_id=workspace_id, user_id=user_id,
            provider=provider, entity_type="search",
            metadata={"filters": filters, "results_count": results_count},
            credits_consumed=credits, request_id=request_id,
            success=success, error=error,
        )

    async def reveal_log(self, *, workspace_id: str, user_id: str,
                          lead_id: str, provider: str,
                          revealed_email: bool = False,
                          revealed_phone: bool = False,
                          credits: int = 0, request_id: str = "") -> str:
        return await self.log(
            action="lead.reveal",
            workspace_id=workspace_id, user_id=user_id,
            provider=provider, entity_id=lead_id, entity_type="lead",
            metadata={"revealed_email": revealed_email, "revealed_phone": revealed_phone},
            credits_consumed=credits, request_id=request_id,
        )

    async def enrich_log(self, *, workspace_id: str, user_id: str,
                          lead_id: str, provider: str,
                          fields_enriched: list, credits: int = 0,
                          request_id: str = "") -> str:
        return await self.log(
            action="lead.enrich",
            workspace_id=workspace_id, user_id=user_id,
            provider=provider, entity_id=lead_id, entity_type="lead",
            metadata={"fields_enriched": fields_enriched},
            credits_consumed=credits, request_id=request_id,
        )

    async def import_log(self, *, workspace_id: str, user_id: str,
                          count: int, source: str, credits: int = 0,
                          request_id: str = "") -> str:
        return await self.log(
            action="lead.import",
            workspace_id=workspace_id, user_id=user_id,
            provider=source, entity_type="batch",
            metadata={"count": count, "source": source},
            credits_consumed=credits, request_id=request_id,
        )

    async def credit_log(self, *, workspace_id: str, user_id: str,
                          action: str, cost: int, balance_after: int,
                          provider: str = "", request_id: str = "") -> str:
        return await self.log(
            action=f"credit.{action}",
            workspace_id=workspace_id, user_id=user_id,
            provider=provider, entity_type="credit",
            metadata={"cost": cost, "balance_after": balance_after},
            credits_consumed=cost, request_id=request_id,
        )

    async def query(self, workspace_id: str, limit: int = 100,
                     offset: int = 0, action: Optional[str] = None,
                     since: Optional[str] = None) -> list:
        if self._db is not None:
            query = {"workspace_id": workspace_id}
            if action:
                query["action"] = action
            if since:
                query["timestamp"] = {"$gte": since}
            cursor = self._db.lead_audit_log.find(query, {"_id": 0})
            cursor.sort("_ts", -1).skip(offset).limit(limit)
            return await cursor.to_list(limit)
        items = [e for e in self._memory if e.get("workspace_id") == workspace_id]
        if action:
            items = [e for e in items if e.get("action") == action]
        items.sort(key=lambda x: x.get("_ts", 0), reverse=True)
        return items[offset:offset + limit]

    async def provider_stats(self, provider: str, since: Optional[str] = None) -> Dict[str, Any]:
        """Aggregate stats for a given provider (success rate, latency, etc.)."""
        if self._db is not None:
            match = {"provider": provider}
            if since:
                match["timestamp"] = {"$gte": since}
            pipeline = [
                {"$match": match},
                {"$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "successes": {"$sum": {"$cond": ["$success", 1, 0]}},
                    "failures": {"$sum": {"$cond": [{"$not": "$success"}, 1, 0]}},
                    "total_credits": {"$sum": "$credits_consumed"},
                }}
            ]
            cursor = self._db.lead_audit_log.aggregate(pipeline)
            result = await cursor.to_list(1)
            if result:
                r = result[0]
                total = r["total"] or 1
                return {
                    "total_requests": r["total"],
                    "success_rate": round(r["successes"] / total * 100, 2),
                    "failures": r["failures"],
                    "total_credits_consumed": r["total_credits"],
                }
        return {"total_requests": 0, "success_rate": 100.0, "failures": 0, "total_credits_consumed": 0}
