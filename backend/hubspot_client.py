"""HubSpot — real OAuth + CRM/engagements pull, mocked-first.

Replaces the pure theatre in server.py (a "sync" that stamped `hs-<id>` on our own
records and never contacted HubSpot). With credentials this does the real OAuth
dance and reads real contacts, deals, and engagements (emails/notes/calls) so a
proposal's Context Pack can include history logged in HubSpot, not just ours.

Mocked-first (`HUBSPOT_MOCKED = not client id/secret`): with no app configured the
whole flow is demoable, and — crucially — the mock still returns *engagements*, so
the Context-Pack merge that the doc asks for is exercisable without a HubSpot
account.

Tokens are encrypted at rest with the same Fernet helper the calendar/mailbox
clients use.
"""

import os
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from google_calendar_client import encrypt_token, decrypt_token  # shared Fernet

log = logging.getLogger(__name__)

HUBSPOT_CLIENT_ID = os.environ.get("HUBSPOT_CLIENT_ID", "")
HUBSPOT_CLIENT_SECRET = os.environ.get("HUBSPOT_CLIENT_SECRET", "")
HUBSPOT_REDIRECT_URI = os.environ.get("HUBSPOT_REDIRECT_URI", "")
HUBSPOT_MOCKED = not (HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET)

BASE = "https://api.hubapi.com"
AUTH = "https://app.hubspot.com/oauth/authorize"
SCOPES = "crm.objects.contacts.read crm.objects.deals.read oauth"


def status() -> Dict[str, Any]:
    return {"mocked": HUBSPOT_MOCKED}


# ----------------------------- OAuth ------------------------------------------
def auth_url(state: str) -> str:
    if HUBSPOT_MOCKED:
        return ""
    return f"{AUTH}?" + urlencode({
        "client_id": HUBSPOT_CLIENT_ID,
        "redirect_uri": HUBSPOT_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    })


async def exchange_code(code: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{BASE}/oauth/v1/token", data={
            "grant_type": "authorization_code",
            "client_id": HUBSPOT_CLIENT_ID,
            "client_secret": HUBSPOT_CLIENT_SECRET,
            "redirect_uri": HUBSPOT_REDIRECT_URI,
            "code": code,
        })
        r.raise_for_status()
        d = r.json()
    return {"access_token": d["access_token"], "refresh_token": d.get("refresh_token"),
            "hub_id": d.get("hub_id")}


async def _access_token(integration: Dict[str, Any]) -> str:
    """HubSpot access tokens expire in ~30 min; refresh on demand."""
    refresh = decrypt_token(integration.get("refresh_token_enc"))
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{BASE}/oauth/v1/token", data={
            "grant_type": "refresh_token",
            "client_id": HUBSPOT_CLIENT_ID,
            "client_secret": HUBSPOT_CLIENT_SECRET,
            "refresh_token": refresh,
        })
        r.raise_for_status()
        return r.json()["access_token"]


async def _get(integration: Dict[str, Any], path: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
    token = await _access_token(integration)
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"},
                        params=params or {})
        r.raise_for_status()
        return r.json()


# ----------------------------- Contacts / deals -------------------------------
async def pull_contacts(integration: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
    if HUBSPOT_MOCKED:
        return _MOCK_CONTACTS
    data = await _get(integration, "/crm/v3/objects/contacts",
                      {"limit": limit, "properties": "firstname,lastname,email,company,jobtitle"})
    out = []
    for c in data.get("results", []):
        p = c.get("properties", {})
        out.append({
            "hubspot_id": c["id"],
            "first_name": p.get("firstname", ""), "last_name": p.get("lastname", ""),
            "email": (p.get("email") or "").lower(), "company": p.get("company", ""),
            "title": p.get("jobtitle", ""),
        })
    return [c for c in out if c["email"]]


async def pull_deals(integration: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
    if HUBSPOT_MOCKED:
        return _MOCK_DEALS
    data = await _get(integration, "/crm/v3/objects/deals",
                      {"limit": limit, "properties": "dealname,amount,dealstage"})
    out = []
    for d in data.get("results", []):
        p = d.get("properties", {})
        out.append({
            "hubspot_deal_id": d["id"], "title": p.get("dealname", ""),
            "value": float(p.get("amount") or 0), "stage": p.get("dealstage", ""),
        })
    return out


async def fetch_engagements(integration: Dict[str, Any], contact_hubspot_id: str) -> List[Dict[str, Any]]:
    """Emails, notes and calls logged against a contact — the history the doc wants
    a proposal to draw on. Normalised to the same shape the internal adapter uses."""
    if HUBSPOT_MOCKED:
        return _mock_engagements(contact_hubspot_id)

    out: List[Dict[str, Any]] = []
    for obj, kind in (("emails", "email"), ("notes", "note"), ("calls", "call")):
        try:
            data = await _get(
                integration,
                f"/crm/v3/objects/contacts/{contact_hubspot_id}/associations/{obj}",
                {"limit": 20},
            )
            ids = [a["id"] for a in data.get("results", [])][:10]
            for oid in ids:
                detail = await _get(integration, f"/crm/v3/objects/{obj}/{oid}",
                                    {"properties": "hs_timestamp,hs_email_subject,hs_note_body,hs_call_title,hs_call_body"})
                p = detail.get("properties", {})
                body = (p.get("hs_note_body") or p.get("hs_call_body")
                        or p.get("hs_email_subject") or "").strip()
                out.append({
                    "kind": kind, "at": p.get("hs_timestamp", ""),
                    "subject": p.get("hs_email_subject") or p.get("hs_call_title") or kind.title(),
                    "snippet": _strip_html(body)[:200], "source": "hubspot",
                })
        except Exception as ex:
            log.info("hubspot engagements (%s) failed: %s", obj, ex)
    return out


def _strip_html(s: str) -> str:
    import re
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


# ----------------------------- Mock data --------------------------------------
_MOCK_CONTACTS = [
    {"hubspot_id": "hs-101", "first_name": "Owen", "last_name": "Bright",
     "email": "owen.bright@acmecorp.com", "company": "Acme Corp", "title": "VP RevOps"},
    {"hubspot_id": "hs-102", "first_name": "Nina", "last_name": "Kaur",
     "email": "nina.kaur@laseranalytics.com", "company": "Laser Analytics", "title": "Head of Marketing"},
    {"hubspot_id": "hs-103", "first_name": "Theo", "last_name": "Marchetti",
     "email": "theo.marchetti@brightlabs.io", "company": "Bright Labs", "title": "CTO"},
]

_MOCK_DEALS = [
    {"hubspot_deal_id": "hsd-201", "title": "Acme Corp — platform rollout", "value": 48000, "stage": "presentationscheduled"},
    {"hubspot_deal_id": "hsd-202", "title": "Laser Analytics — retainer", "value": 6000, "stage": "qualifiedtobuy"},
]


def _mock_engagements(contact_hubspot_id: str) -> List[Dict[str, Any]]:
    """Deterministic so tests can assert the merge without a HubSpot account."""
    return [
        {"kind": "email", "at": "2026-06-20T10:00:00Z", "source": "hubspot",
         "subject": "Re: intro call follow-up",
         "snippet": "Thanks for the walkthrough — the team is keen. Can you put pricing in writing?"},
        {"kind": "note", "at": "2026-06-18T14:30:00Z", "source": "hubspot",
         "subject": "Discovery call notes",
         "snippet": "Budget signed off for Q3. Main concern is migration risk from their legacy stack."},
        {"kind": "call", "at": "2026-06-15T09:00:00Z", "source": "hubspot",
         "subject": "Qualification call",
         "snippet": "Decision maker is the VP RevOps; procurement needs a formal proposal doc."},
    ]
