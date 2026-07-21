"""Provider Manager — orchestration layer for all lead providers.

Routes requests to the right provider(s), merges results, deduplicates,
handles failover, manages caching, and provides a single unified interface.
"""
from __future__ import annotations
import asyncio
import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple, Type

from .schema import (
    UnifiedSearchFilters, SearchResult, LeadRecord,
    ProviderCapabilities, ProviderStatus, CreditEstimate,
    RevealRequest, RevealResult, RevealCostEstimate,
)
from .interfaces import LeadProviderAdapter
from .cache import LeadCache
from .audit import AuditLogger
from .credit_engine import CreditEngine


class ProviderManager:
    """Single entry point for all lead intelligence operations.

    The Provider Manager:
      - Maintains a registry of provider adapters
      - Routes searches to the optimal provider(s) based on requested data
      - Merges + deduplicates results from multiple providers
      - Caches results to prevent duplicate API spend
      - Fails over to alternate providers on errors
      - Handles bulk operations (reveal, enrich, verify)
      - Reports provider health and usage stats
    """

    def __init__(self, db=None):
        self._db = db
        self._adapters: Dict[str, LeadProviderAdapter] = {}
        self._cache = LeadCache(db=db, ttl_seconds=3600)
        self._audit = AuditLogger(db=db)
        self._credits = CreditEngine(db=db, billing_module=True)
        self._lock = asyncio.Lock()

    # ── Provider Registry ──────────────────────────────────────────────

    def register(self, adapter: LeadProviderAdapter) -> None:
        self._adapters[adapter.name] = adapter

    def get_adapter(self, name: str) -> Optional[LeadProviderAdapter]:
        return self._adapters.get(name)

    def list_providers(self) -> List[str]:
        return list(self._adapters.keys())

    async def get_provider_statuses(self) -> Dict[str, ProviderStatus]:
        results = {}
        for name, adapter in self._adapters.items():
            try:
                results[name] = await adapter.get_status()
            except Exception:
                results[name] = ProviderStatus(name=name, available=False, healthy=False)
        return results

    async def get_provider_capabilities(self) -> Dict[str, ProviderCapabilities]:
        return {name: a.get_capabilities() for name, a in self._adapters.items()}

    # ── Provider Routing ───────────────────────────────────────────────

    def _route_providers(self, filters: UnifiedSearchFilters) -> List[str]:
        """Intelligently decide which provider(s) to use based on filters.

        Routing rules:
          - Prospeo is the primary people-search provider (search_people, enrich, mobile)
          - Icypeas is email-verification only (verify_email, email find)
          - For combined flows (search + verify), use both
          - For email-only flows (verify_emails without search filters), use Icypeas
        """
        is_search = any([
            filters.job_titles, filters.seniority, filters.industry,
            filters.company_domain, filters.departments, filters.full_name,
            filters.company_name, filters.keywords, filters.skills,
        ])
        needs_mobile = filters.has_mobile or filters.enrich_contacts
        needs_verified = filters.has_verified_email or filters.verify_emails
        is_email_only = needs_verified and not is_search and not needs_mobile

        routes = []

        # Email-only (verify) → Icypeas
        if is_email_only and "icypeas" in self._adapters:
            routes.append("icypeas")
            return routes

        # People search → Prospeo (primary people-search provider)
        if is_search or needs_mobile:
            if "prospeo" in self._adapters:
                routes.append("prospeo")

        # Add Icypeas alongside when verification is needed
        if needs_verified and "icypeas" in self._adapters:
            if "icypeas" not in routes:
                routes.append("icypeas")

        # Fallback to Prospeo
        if not routes and "prospeo" in self._adapters:
            routes.append("prospeo")

        return routes

    # ── Search ─────────────────────────────────────────────────────────

    async def search(self, filters: UnifiedSearchFilters,
                     workspace_id: str = "", user_id: str = "",
                     ip_address: str = "", request_id: str = "") -> SearchResult:
        t0 = time.time()
        request_id = request_id or str(uuid.uuid4())
        providers = self._route_providers(filters)

        if not providers:
            return SearchResult(search_id=request_id)

        # Check cache first
        filters_json = json.dumps(filters.model_dump(), sort_keys=True, default=str)
        for provider in providers:
            cache_key = LeadCache.search_key(provider, filters_json)
            cached = await self._cache.get(cache_key)
            if cached is not None:
                result = SearchResult(**cached)
                result.cached = True
                result.providers_used = [provider]
                result.search_id = request_id
                result.processing_time_ms = int((time.time() - t0) * 1000)
                return result

        # Execute against selected provider(s)
        all_leads: List[LeadRecord] = []
        errors: List[str] = []
        used_providers: List[str] = []

        for provider_name in providers:
            adapter = self._adapters.get(provider_name)
            if not adapter:
                continue
            try:
                result = await adapter.search_people(filters)
                if result.leads:
                    all_leads.extend(result.leads)
                    used_providers.append(provider_name)
                    # We got results — no need to try other providers
                    break
            except Exception as exc:
                errors.append(f"{provider_name}: {str(exc)}")
                # Failover to next provider
                continue

        # Deduplicate across providers
        all_leads = self._deduplicate(all_leads)

        # Cache results
        if all_leads:
            cache_data = SearchResult(
                leads=all_leads,
                total_estimated=len(all_leads),
                total_returned=len(all_leads),
                page=filters.page,
                page_size=filters.page_size,
                has_more=False,
                providers_used=used_providers,
            )
            for p in used_providers:
                await self._cache.set(
                    LeadCache.search_key(p, filters_json),
                    cache_data.model_dump(mode="json"),
                )

        elapsed = int((time.time() - t0) * 1000)

        # Audit
        await self._audit.search_log(
            workspace_id=workspace_id, user_id=user_id,
            filters=filters.model_dump(), results_count=len(all_leads),
            provider="|".join(used_providers) if used_providers else "none",
            request_id=request_id,
        )

        return SearchResult(
            leads=all_leads,
            total_estimated=len(all_leads),
            total_returned=len(all_leads),
            page=filters.page,
            page_size=filters.page_size,
            has_more=False,
            estimated_credits=(await self._credits.estimate_search(filters.model_dump(), used_providers)).estimated_cost,
            processing_time_ms=elapsed,
            providers_used=used_providers,
            search_id=request_id,
        )

    # ── Reveal System ─────────────────────────────────────────────────

    async def estimate_reveal_cost(self, req: RevealRequest,
                                    workspace_id: str = "") -> RevealCostEstimate:
        """Estimate credit cost for a reveal operation without executing."""
        per_lead = 0
        if req.reveal_both:
            per_lead = 12
        elif req.reveal_email:
            per_lead = 5
        elif req.reveal_phone:
            per_lead = 10

        # Check which leads already have revealed data
        already = 0
        if self._db is not None:
            for lid in req.lead_ids:
                existing = await self._db.leads.find_one(
                    {"id": lid, "workspace_id": workspace_id},
                    {"email": 1, "phone": 1},
                )
                if existing:
                    has_email = bool(existing.get("email")) and req.reveal_email
                    has_phone = bool(existing.get("phone")) and req.reveal_phone
                    if (req.reveal_both and has_email and has_phone) or \
                       (req.reveal_email and has_email) or \
                       (req.reveal_phone and has_phone):
                        already += 1

        return RevealCostEstimate(
            total_credits=per_lead * (len(req.lead_ids) - already),
            per_lead=per_lead,
            leads_requested=len(req.lead_ids),
            leads_already_revealed=already,
        )

    async def reveal_leads(self, req: RevealRequest, workspace_id: str = "",
                            user_id: str = "", request_id: str = "") -> List[RevealResult]:
        """Execute reveal operations. Uses Prospeo for phone, Icypeas for email fallback."""
        request_id = request_id or str(uuid.uuid4())
        results = []
        prospeo = self._adapters.get("prospeo")
        icypeas = self._adapters.get("icypeas")

        for lid in req.lead_ids:
            # Fetch lead from DB
            lead_data = None
            if self._db is not None:
                doc = await self._db.leads.find_one(
                    {"id": lid, "workspace_id": workspace_id},
                    {"_id": 0},
                )
                if doc:
                    lead_data = doc

            if not lead_data:
                results.append(RevealResult(lead_id=lid, success=False, error="Lead not found"))
                continue

            # Convert to LeadRecord
            lead = self._dict_to_lead(lead_data)

            # Skip if already revealed
            if req.reveal_both and lead.contact.email and lead.contact.phone:
                results.append(RevealResult(
                    lead_id=lid, email=lead.contact.email, phone=lead.contact.phone,
                    email_revealed=True, phone_revealed=True, success=True, credits_consumed=0,
                ))
                continue
            if req.reveal_email and lead.contact.email:
                req.reveal_email = False
            if req.reveal_phone and lead.contact.phone:
                req.reveal_phone = False

            credits = 0

            # Use Prospeo for reveal if available
            if prospeo and (req.reveal_phone or req.reveal_email):
                try:
                    updated, cost = await prospeo.reveal_lead(
                        lead, reveal_email=req.reveal_email, reveal_phone=req.reveal_phone,
                    )
                    credits += cost
                    lead = updated
                except Exception:
                    pass

            # Fallback: Icypeas for email-only reveal
            if icypeas and req.reveal_email and not lead.contact.email:
                try:
                    updated, _ = await icypeas.reveal_email(lead)
                    if updated.contact.email:
                        lead.contact.email = updated.contact.email
                        lead.contact.email_revealed = True
                        credits += 1
                except Exception:
                    pass

            # Save revealed data to CRM
            if self._db is not None and (lead.contact.email_revealed or lead.contact.phone_revealed):
                update: Dict[str, Any] = {}
                if lead.contact.email_revealed:
                    update["email"] = lead.contact.email
                    update["email_revealed"] = True
                    update["email_revealed_at"] = time.time()
                if lead.contact.phone_revealed:
                    update["phone"] = lead.contact.phone
                    update["phone_revealed"] = True
                    update["phone_revealed_at"] = time.time()
                if update:
                    await self._db.leads.update_one(
                        {"id": lid, "workspace_id": workspace_id},
                        {"$set": update},
                    )

            await self._audit.reveal_log(
                workspace_id=workspace_id, user_id=user_id,
                lead_id=lid, provider="prospeo",
                revealed_email=lead.contact.email_revealed,
                revealed_phone=lead.contact.phone_revealed,
                credits=credits, request_id=request_id,
            )

            results.append(RevealResult(
                lead_id=lid,
                email=lead.contact.email,
                phone=lead.contact.phone,
                email_revealed=lead.contact.email_revealed,
                phone_revealed=lead.contact.phone_revealed,
                credits_consumed=credits,
                success=True,
            ))

        return results

    # ── Enrich ─────────────────────────────────────────────────────────

    async def enrich_lead(self, lead_id: str, workspace_id: str = "",
                           user_id: str = "") -> Optional[LeadRecord]:
        """Enrich a single CRM lead with data from providers."""
        if self._db is None:
            return None

        doc = await self._db.leads.find_one(
            {"id": lead_id, "workspace_id": workspace_id},
            {"_id": 0},
        )
        if not doc:
            return None

        lead = self._dict_to_lead(doc)
        prospeo = self._adapters.get("prospeo")

        if prospeo:
            try:
                lead = await prospeo.enrich_lead(lead)
                # Save updates to DB
                await self._db.leads.update_one(
                    {"id": lead_id, "workspace_id": workspace_id},
                    {"$set": {
                        "enrichment_status": "enriched",
                        "company_industry": lead.company.industry,
                        "company_size": lead.company.employee_range,
                        "technologies": lead.company.technologies,
                        "confidence_score": lead.confidence_score,
                    }},
                )
                await self._audit.enrich_log(
                    workspace_id=workspace_id, user_id=user_id,
                    lead_id=lead_id, provider="prospeo",
                    fields_enriched=["industry", "company_size", "technologies", "confidence"],
                )
            except Exception:
                pass

        return lead

    # ── Email Verification ─────────────────────────────────────────────

    async def verify_emails(self, emails: List[str],
                             workspace_id: str = "") -> List[Dict[str, Any]]:
        """Verify multiple emails using the best available provider."""
        icypeas = self._adapters.get("icypeas")
        if icypeas:
            try:
                return await icypeas.verify_emails(emails)
            except Exception:
                pass
        return [{"status": "unknown", "score": 0.0} for _ in emails]

    # ── Deduplication ──────────────────────────────────────────────────

    def _deduplicate(self, leads: List[LeadRecord]) -> List[LeadRecord]:
        """Remove duplicate leads by email, LinkedIn URL, and full name."""
        seen_emails: set = set()
        seen_li: set = set()
        seen_names: set = set()
        unique: List[LeadRecord] = []

        for lead in leads:
            email = lead.contact.email.lower().strip() if lead.contact.email else ""
            li = lead.contact.linkedin_url.strip().lower() if lead.contact.linkedin_url else ""
            name = lead.person.full_name.strip().lower() if lead.person.full_name else ""

            dup = False
            if email and email in seen_emails:
                dup = True
            if li and li in seen_li:
                dup = True
            if name and name in seen_names:
                dup = True

            if dup:
                continue

            unique.append(lead)
            if email:
                seen_emails.add(email)
            if li:
                seen_li.add(li)
            if name:
                seen_names.add(name)

        return unique

    # ── Import to CRM ──────────────────────────────────────────────────

    async def import_leads(self, leads: List[LeadRecord], workspace_id: str,
                            user_id: str = "", merge_strategy: str = "skip",
                            request_id: str = "") -> Dict[str, Any]:
        """Import leads into CRM with duplicate detection."""
        request_id = request_id or str(uuid.uuid4())
        added = 0
        skipped = 0
        merged = 0
        updated = 0

        for lead in leads:
            email = lead.contact.email.lower().strip() if lead.contact.email else ""
            # Duplicate detection
            dup_query: Dict[str, Any] = {"workspace_id": workspace_id}
            dup_conditions = []
            if email:
                dup_conditions.append({"email": email})
            if lead.contact.linkedin_url:
                dup_conditions.append({"linkedin_url": lead.contact.linkedin_url})
            if lead.person.full_name:
                dup_conditions.append({"full_name": lead.person.full_name})
            if dup_conditions:
                dup_query["$or"] = dup_conditions

            if self._db is not None and dup_conditions:
                existing = await self._db.leads.find_one(dup_query, {"_id": 0})
                if existing:
                    if merge_strategy == "skip":
                        skipped += 1
                        continue
                    elif merge_strategy == "update":
                        await self._db.leads.update_one(
                            {"id": existing["id"]},
                            {"$set": self._lead_to_dict(lead)},
                        )
                        updated += 1
                        continue
                    elif merge_strategy == "merge":
                        merged_data = {**existing, **self._lead_to_dict(lead)}
                        await self._db.leads.update_one(
                            {"id": existing["id"]},
                            {"$set": merged_data},
                        )
                        merged += 1
                        continue

            # New lead
            doc = self._lead_to_dict(lead)
            doc["id"] = str(uuid.uuid4())
            doc["workspace_id"] = workspace_id
            doc["owner"] = user_id
            doc["import_date"] = time.time()
            doc["status"] = "new"
            doc["tags"] = []

            if self._db is not None:
                await self._db.leads.insert_one(doc)
            added += 1

        await self._audit.import_log(
            workspace_id=workspace_id, user_id=user_id,
            count=added, source="lead_intelligence",
            request_id=request_id,
        )

        return {
            "added": added, "skipped": skipped, "merged": merged,
            "updated": updated, "total": len(leads),
        }

    # ── Natural Language Search ────────────────────────────────────────

    async def natural_search(self, query: str, workspace_id: str = "",
                              user_id: str = "") -> SearchResult:
        """Parse a natural language query into structured filters and execute."""
        filters = await self._nl_to_filters(query)
        result = await self.search(filters, workspace_id=workspace_id, user_id=user_id)
        result.parsed_filters = {k: v for k, v in filters.model_dump().items() if v not in (None, "", [], {}, False)}
        return result

    async def _nl_to_filters(self, query: str) -> UnifiedSearchFilters:
        """Use an LLM to parse natural language into structured filters."""
        import os
        import logging
        logger = logging.getLogger("pitcheq")
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            logger.warning("ANTHROPIC_API_KEY not set — falling back to keyword-only search")
            return UnifiedSearchFilters(keywords=query, natural_query=query)

        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=api_key)
            sys_msg = """You are a lead search filter parser. Convert the user's natural language query into structured JSON filters.
Use broad industry names that work with B2B data providers (e.g. "Software", "Financial Services", "Healthcare", "Manufacturing", "Retail", not trendy buzzwords).
Output ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "job_titles": ["list", "of", "titles"],
  "seniority": ["C-Suite", "Vice President", "Director", "Senior", "Mid-Level", "Entry"],
  "departments": ["Sales", "Marketing", "Engineering & Technical"],
  "industry": ["broad industry names like Software, Financial Services, Healthcare"],
  "company_domain": "domain or empty",
  "employee_count_min": null,
  "employee_count_max": null,
  "country": ["country names"],
  "city": ["city names"],
  "state": ["state names"],
  "has_verified_email": false,
  "has_mobile": false,
  "keywords": "any remaining search terms"
}"""
            msg = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1000,
                system=sys_msg,
                messages=[{"role": "user", "content": query}],
            )
            text = msg.content[0].text if msg.content else "{}"
            # Strip markdown code fences if present
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            import json as _json
            parsed = _json.loads(text)
            logger.info("AI parsed query '%s' into filters: %s", query, parsed)
            return UnifiedSearchFilters(**{**parsed, "natural_query": query})
        except ImportError:
            logger.warning("anthropic package not installed — falling back to keyword search")
            return UnifiedSearchFilters(keywords=query, natural_query=query)
        except Exception as exc:
            logger.error("AI filter parsing failed for '%s': %s: %s", query, type(exc).__name__, exc)
            return UnifiedSearchFilters(keywords=query, natural_query=query)

    # ── Schema Conversion Helpers ──────────────────────────────────────

    def _lead_to_dict(self, lead: LeadRecord) -> Dict[str, Any]:
        d = lead.model_dump(mode="json")
        # Flatten person/company/contact for backward compatibility with
        # existing CRM schema
        flat = {
            "id": d.get("id", ""),
            "first_name": lead.person.first_name,
            "last_name": lead.person.last_name,
            "full_name": lead.person.full_name,
            "title": lead.person.title,
            "headline": lead.person.headline,
            "seniority": lead.person.seniority,
            "department": lead.person.department,
            "email": lead.contact.email,
            "email_revealed": lead.contact.email_revealed,
            "phone": lead.contact.phone,
            "phone_revealed": lead.contact.phone_revealed,
            "linkedin_url": lead.contact.linkedin_url,
            "company": lead.company.name,
            "company_domain": lead.company.domain,
            "company_website": lead.company.website,
            "company_industry": lead.company.industry,
            "company_size": lead.company.employee_range,
            "technologies": lead.company.technologies,
            "description": lead.company.description,
            "company_logo": lead.company.logo_url,
            "company_linkedin": lead.company.linkedin_url,
            "location": lead.person.location.model_dump(),
            "skills": lead.person.skills,
            "confidence_score": lead.confidence_score,
            "lead_score": lead.lead_score,
            "ai_score": lead.ai_score,
            "source_provider": lead.source_provider,
            "enrichment_status": lead.enrichment_status,
            "verification_status": lead.verification_status,
            "tags": lead.tags,
            "owner": lead.owner,
            "crm_status": lead.crm_status,
            "import_date": lead.import_date,
        }
        return flat

    def _dict_to_lead(self, d: Dict[str, Any]) -> LeadRecord:
        location_data = d.get("location") or {}
        return LeadRecord(
            id=d.get("id", ""),
            person=LeadPerson(
                first_name=d.get("first_name", ""),
                last_name=d.get("last_name", ""),
                full_name=d.get("full_name", ""),
                title=d.get("title", ""),
                headline=d.get("headline", ""),
                seniority=d.get("seniority", ""),
                department=d.get("department", ""),
                skills=d.get("skills", []),
                location=LeadLocation(
                    country=location_data.get("country", ""),
                    state=location_data.get("state", ""),
                    city=location_data.get("city", ""),
                ),
            ),
            company=LeadCompany(
                name=d.get("company", ""),
                domain=d.get("company_domain", ""),
                website=d.get("company_website", ""),
                industry=d.get("company_industry", ""),
                employee_range=d.get("company_size", ""),
                description=d.get("description", ""),
                logo_url=d.get("company_logo", ""),
                linkedin_url=d.get("company_linkedin", ""),
                technologies=d.get("technologies", []),
            ),
            contact=LeadContact(
                email=d.get("email", ""),
                email_revealed=d.get("email_revealed", False),
                phone=d.get("phone", ""),
                phone_revealed=d.get("phone_revealed", False),
                linkedin_url=d.get("linkedin_url", ""),
            ),
            confidence_score=d.get("confidence_score", 0.0),
            lead_score=d.get("lead_score", 0.0),
            ai_score=d.get("ai_score", 0.0),
            enrichment_status=d.get("enrichment_status", "none"),
            verification_status=d.get("verification_status", "unknown"),
            source_provider=d.get("source_provider", ""),
            tags=d.get("tags", []),
            owner=d.get("owner", ""),
            crm_status=d.get("crm_status", "new"),
            import_date=d.get("import_date"),
        )
