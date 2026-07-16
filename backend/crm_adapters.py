"""CRM adapter layer — a single Deal interface over multiple CRMs.

The doc asks for a `Deal` interface with pluggable adapters that each return the
deal, its contacts, and full history. Today the only CRM with real data is the
internal one (Pitch/Voice/Schedule EQ all write to it), so `InternalCRMAdapter`
is the primary implementation. `HubSpotAdapter` *enriches* it: when a lead is
HubSpot-linked and HubSpot is connected, its engagements (emails/notes/calls
logged in HubSpot) are merged in.

Nothing in the data model is keyed by `deal_id` — `conversations` and `activities`
are keyed by `lead_id` — so every adapter resolves history through the deal's
lead. That's a real constraint of the existing schema, handled here rather than
papered over.

The interface is deliberately small so Salesforce/Zoho/Pipedrive can be added
later as siblings without touching the Context Pack or the chain.
"""

from typing import Any, Dict, List, Optional

from server import db
import hubspot_client


# DealContext is a plain dict with this shape (documented, per the doc's request):
#   { deal:{id,title,value,stage,currency}, client:{company,domain,contacts[]},
#     emails[], calls[], meetings[], timeline[], source }


async def _internal_context(workspace_id: str, deal: Dict[str, Any]) -> Dict[str, Any]:
    lead = await db.leads.find_one(
        {"id": deal["lead_id"], "workspace_id": workspace_id}, {"_id": 0}) or {}
    domain = ""
    if lead.get("email") and "@" in lead["email"]:
        domain = lead["email"].split("@", 1)[1]

    # Emails — conversation threads for this lead.
    convos = await db.conversations.find(
        {"workspace_id": workspace_id, "lead_id": lead.get("id")}, {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    emails: List[Dict[str, Any]] = []
    for c in convos:
        for m in c.get("messages", []):
            emails.append({
                "from": "prospect" if m.get("from") == "them" else "us",
                "at": m.get("at", ""), "subject": c.get("classification", ""),
                "snippet": (m.get("body") or "")[:200],
                "direction": "inbound" if m.get("from") == "them" else "outbound",
                "source": "internal",
            })
    # Also surface what we sent (send_queue carries the real outbound subject/body).
    sent = await db.send_queue.find(
        {"workspace_id": workspace_id, "lead_id": lead.get("id"), "status": "sent"}, {"_id": 0}
    ).sort("sent_at", -1).to_list(20)
    for s in sent:
        emails.append({
            "from": "us", "at": s.get("sent_at", ""), "subject": s.get("subject", ""),
            "snippet": (s.get("body_text") or "")[:200], "direction": "outbound", "source": "internal",
        })

    calls = await db.calls.find(
        {"workspace_id": workspace_id, "lead_id": lead.get("id")}, {"_id": 0}
    ).sort("started_at", -1).to_list(20)
    call_rows = [{
        "at": c.get("started_at", ""), "summary": c.get("summary", "") or c.get("disposition", ""),
        "sentiment": c.get("sentiment", ""), "outcome": c.get("qualification", ""),
    } for c in calls]

    meetings = await db.bookings.find(
        {"workspace_id": workspace_id, "lead_id": lead.get("id")}, {"_id": 0}
    ).sort("start_at", -1).to_list(20)
    meeting_rows = [{
        "at": m.get("start_at", ""), "event": m.get("event_type_name", "") or "Meeting",
        "status": m.get("status", ""),
    } for m in meetings]

    activities = await db.activities.find(
        {"workspace_id": workspace_id, "lead_id": lead.get("id")}, {"_id": 0}
    ).sort("at", -1).to_list(60)
    timeline = [{"agent": a.get("agent"), "type": a.get("type"),
                 "summary": a.get("summary"), "at": a.get("at")} for a in activities]

    name = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip()
    return {
        "deal": {
            "id": deal["id"], "title": deal.get("title", ""),
            "value": deal.get("value", 0), "stage": deal.get("stage", ""),
            "currency": deal.get("currency", "USD"),
        },
        "client": {
            "company": lead.get("company", ""), "domain": domain,
            "contacts": [{"name": name, "title": lead.get("title", ""), "email": lead.get("email", "")}]
                        if name or lead.get("email") else [],
        },
        "lead": lead,   # kept for downstream research (not part of the public shape)
        "emails": emails, "calls": call_rows, "meetings": meeting_rows,
        "timeline": timeline, "source": "internal",
    }


async def _merge_hubspot(workspace_id: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Fold HubSpot engagements into the context when the lead is HubSpot-linked."""
    lead = ctx.get("lead") or {}
    hs_id = lead.get("hubspot_id")
    if not hs_id:
        return ctx
    integration = await db.hubspot_integrations.find_one(
        {"workspace_id": workspace_id}, {"_id": 0})
    if not integration or not integration.get("connected"):
        return ctx

    try:
        engagements = await hubspot_client.fetch_engagements(integration, hs_id)
    except Exception:
        engagements = []

    for e in engagements:
        if e["kind"] == "email":
            ctx["emails"].append({
                "from": "prospect", "at": e.get("at", ""), "subject": e.get("subject", ""),
                "snippet": e.get("snippet", ""), "direction": "inbound", "source": "hubspot",
            })
        elif e["kind"] == "call":
            ctx["calls"].append({"at": e.get("at", ""), "summary": e.get("snippet", ""),
                                 "sentiment": "", "outcome": "", "source": "hubspot"})
        else:  # note
            ctx["timeline"].append({"agent": "hubspot", "type": "note",
                                    "summary": e.get("snippet", ""), "at": e.get("at", "")})
    if engagements:
        ctx["source"] = "internal+hubspot"
    return ctx


async def get_deal_context(workspace_id: str, deal_id: str) -> Optional[Dict[str, Any]]:
    """The one entry point. Returns a DealContext, or None if the deal is gone."""
    deal = await db.deals.find_one({"id": deal_id, "workspace_id": workspace_id}, {"_id": 0})
    if not deal:
        return None
    ctx = await _internal_context(workspace_id, deal)
    ctx = await _merge_hubspot(workspace_id, ctx)
    return ctx
