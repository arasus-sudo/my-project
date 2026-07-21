"""Result caching layer — prevents duplicate API calls and stores revealed data."""
from __future__ import annotations
import json
import hashlib
import time
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta


class LeadCache:
    """In-memory + optional DB-backed cache for lead search results and reveals.

    Cache tiers:
      Tier 1 (L1): In-memory dict — fast, process-local, lost on restart.
      Tier 2 (L2): MongoDB-backed — persistent across restarts (optional, wired
        via the `db` argument or left None for dev/test).

    Cache keys are SHA-256 hashes of the serialised query/identifier + provider.
    """

    def __init__(self, db=None, ttl_seconds: int = 3600):
        self._memory: Dict[str, Tuple[float, Any]] = {}
        self._db = db
        self._ttl = ttl_seconds

    # ── key helpers ────────────────────────────────────────────────────

    @staticmethod
    def _hash(*parts: str) -> str:
        raw = "|".join(parts)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def search_key(provider: str, filters_json: str) -> str:
        return f"search:{provider}:{LeadCache._hash(filters_json)}"

    @staticmethod
    def reveal_key(provider: str, lead_id: str) -> str:
        return f"reveal:{provider}:{LeadCache._hash(lead_id)}"

    @staticmethod
    def enrich_key(provider: str, lead_id: str) -> str:
        return f"enrich:{provider}:{LeadCache._hash(lead_id)}"

    @staticmethod
    def verify_key(email: str) -> str:
        return f"verify:{LeadCache._hash(email)}"

    # ── get / set ──────────────────────────────────────────────────────

    async def get(self, key: str) -> Optional[Any]:
        """Retrieve from L1 (memory) first, then L2 (DB)."""
        # L1
        if key in self._memory:
            ts, val = self._memory[key]
            if time.time() - ts < self._ttl:
                return val
            del self._memory[key]

        # L2
        if self._db is not None:
            doc = await self._db.lead_cache.find_one({"_k": key})
            if doc and time.time() - doc.get("_ts", 0) < self._ttl:
                val = doc.get("_v")
                self._memory[key] = (time.time(), val)  # warm L1
                return val
        return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Store in L1 and L2."""
        now = time.time()
        self._memory[key] = (now, value)
        if self._db is not None:
            await self._db.lead_cache.update_one(
                {"_k": key},
                {"$set": {"_v": value, "_ts": now, "_ttl": ttl or self._ttl}},
                upsert=True,
            )

    async def invalidate(self, key: str) -> None:
        self._memory.pop(key, None)
        if self._db is not None:
            await self._db.lead_cache.delete_one({"_k": key})

    async def invalidate_by_prefix(self, prefix: str) -> None:
        to_del = [k for k in self._memory if k.startswith(prefix)]
        for k in to_del:
            del self._memory[k]
        if self._db is not None:
            await self._db.lead_cache.delete_many({"_k": {"$regex": f"^{prefix}"}})

    async def clear_expired(self) -> int:
        count = 0
        now = time.time()
        # L1
        expired = [k for k, (ts, _) in self._memory.items() if now - ts >= self._ttl]
        for k in expired:
            del self._memory[k]
            count += 1
        # L2
        if self._db is not None:
            cutoff = now - self._ttl
            r = await self._db.lead_cache.delete_many({"_ts": {"$lt": cutoff}})
            count += r.deleted_count
        return count

    async def search_cache_hit(self, provider: str, filters: Dict[str, Any]) -> bool:
        key = self.search_key(provider, json.dumps(filters, sort_keys=True, default=str))
        return await self.get(key) is not None
