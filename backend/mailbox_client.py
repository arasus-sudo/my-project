"""Real outbound mailboxes — Gmail API, Microsoft Graph and Zoho Mail API.

Replaces mailbox "connection" that was pure theatre: the old create route stamped
`status: "connected"` with no OAuth and no handshake, then invented a bounce rate
and a spam rate, and its DNS "check" set SPF/DKIM/DMARC to True unconditionally.

Why not a transactional provider (Resend/Postmark/SendGrid): cold outbound
through one violates their ToS and gets the sending domain permanently blocked.
It also lands in Promotions, because the From domain doesn't match the sending
infrastructure. Cold email has to come from the rep's own mailbox — which is also
why per-mailbox daily caps, warmup and rotation exist at all.

Mocked-first: with no Google/Microsoft credentials the whole flow (connect, send,
poll replies) is demoable and every send is recorded, but nothing leaves the box.
"""

import os
import re
import base64
import logging
from email.message import EmailMessage
from email.utils import make_msgid, parseaddr
from typing import Any, Dict, List, Optional

import httpx

from google_calendar_client import (
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
    encrypt_token, decrypt_token,
)

# Deliberately NOT imported from google_calendar_client: that module resolves
# its redirect to the Calendar callback (/api/schedule-eq/oauth/callback),
# while Gmail consent must round-trip to this flow's own callback
# (/api/mailbox/oauth/callback). Same OAuth client, different redirect per flow.
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "")

# Google merges previously granted scopes into new tokens (e.g. openid/email/
# profile from "Sign in with Google"), so the returned scope list is a superset
# of what this flow asks for. oauthlib treats any mismatch as an error —
# "Scope has changed from ... to ..." — and rejects an otherwise-valid token.
# This is oauthlib's own documented switch to accept scope supersets.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

log = logging.getLogger(__name__)

# Sending needs its own scopes; the calendar client only asks for calendar.
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]

MS_CLIENT_ID = os.environ.get("MS_CLIENT_ID", "")
MS_CLIENT_SECRET = os.environ.get("MS_CLIENT_SECRET", "")
MS_REDIRECT_URI = os.environ.get("MS_REDIRECT_URI", "")
MS_SCOPES = "offline_access Mail.Send Mail.Read"

# Zoho Mail OAuth. Sending needs ZohoMail.messages.CREATE; fetching the
# accountId (which /api/accounts/{accountId}/messages requires) needs
# ZohoMail.accounts.READ. access_type=offline is what gives us a refresh token.
ZOHO_CLIENT_ID = os.environ.get("ZOHO_CLIENT_ID", "")
ZOHO_CLIENT_SECRET = os.environ.get("ZOHO_CLIENT_SECRET", "")
ZOHO_REDIRECT_URI = os.environ.get("ZOHO_REDIRECT_URI", "")
ZOHO_SCOPES = "ZohoMail.messages.CREATE,ZohoMail.accounts.READ"
ZOHO_ACCOUNTS_URL = os.environ.get("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.com")
ZOHO_API_URL = os.environ.get("ZOHO_API_URL", "https://mail.zoho.com/api")

GMAIL_MOCKED = not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
MS_MOCKED = not (MS_CLIENT_ID and MS_CLIENT_SECRET)
ZOHO_MOCKED = not (ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET)


def provider_status() -> Dict[str, str]:
    return {
        "gmail": "test_mode" if GMAIL_MOCKED else "live",
        "outlook": "test_mode" if MS_MOCKED else "live",
        "zoho": "test_mode" if ZOHO_MOCKED else "live",
    }


# ----------------------------- MIME -------------------------------------------
def build_mime(*, from_addr: str, from_name: str, to_addr: str, subject: str,
                html: str, text: str, reply_to: Optional[str] = None,
                in_reply_to: Optional[str] = None) -> EmailMessage:
    """multipart/alternative — a text part alongside the HTML.

    This is not optional for cold outbound: an HTML-only body is one of the
    strongest single spam signals there is."""
    msg = EmailMessage()
    msg["From"] = f"{from_name} <{from_addr}>" if from_name else from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid()
    if reply_to:
        msg["Reply-To"] = reply_to
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = in_reply_to
    msg.set_content(text or " ")
    msg.add_alternative(html or f"<p>{text}</p>", subtype="html")
    return msg


# ----------------------------- Gmail ------------------------------------------
def _gmail_config() -> Dict[str, Any]:
    return {"web": {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [GOOGLE_REDIRECT_URI],
    }}


# autogenerate_code_verifier=False on both flows: google_auth_oauthlib enables
# PKCE by default, but the consent URL and the token exchange happen in two
# separate requests here, each with a fresh Flow — the exchange never has the
# verifier the URL's challenge was generated from, and Google rejects it with
# "(invalid_grant) Missing code verifier." This is a confidential server-side
# client; the client_secret authenticates the exchange, so PKCE is optional.
def gmail_auth_url(state: str) -> str:
    if GMAIL_MOCKED:
        return ""
    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(_gmail_config(), scopes=GMAIL_SCOPES,
                                    redirect_uri=GOOGLE_REDIRECT_URI,
                                    autogenerate_code_verifier=False)
    url, _ = flow.authorization_url(access_type="offline", prompt="consent",
                                     state=state, include_granted_scopes="true")
    return url


def gmail_exchange(code: str) -> Dict[str, Any]:
    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(_gmail_config(), scopes=GMAIL_SCOPES,
                                    redirect_uri=GOOGLE_REDIRECT_URI,
                                    autogenerate_code_verifier=False)
    flow.fetch_token(code=code)
    c = flow.credentials
    return {"access_token": c.token, "refresh_token": c.refresh_token,
            "expiry": c.expiry.isoformat() if c.expiry else None}


def _gmail_service(mailbox: Dict[str, Any]):
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    creds = Credentials(
        token=decrypt_token(mailbox.get("access_token_enc")),
        refresh_token=decrypt_token(mailbox.get("refresh_token_enc")),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID, client_secret=GOOGLE_CLIENT_SECRET,
        scopes=GMAIL_SCOPES,
    )
    return build("gmail", "v1", credentials=creds)


def _gmail_send(mailbox: Dict[str, Any], msg: EmailMessage) -> Dict[str, Any]:
    service = _gmail_service(mailbox)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    return {"provider_message_id": sent["id"], "thread_id": sent.get("threadId"),
            "message_id_header": msg["Message-ID"], "mocked": False}


def _gmail_fetch_replies(mailbox: Dict[str, Any], thread_id: str) -> List[Dict[str, Any]]:
    """Anything in the thread that isn't from us is a reply."""
    service = _gmail_service(mailbox)
    thread = service.users().threads().get(userId="me", id=thread_id, format="full").execute()
    ours = (mailbox.get("email") or "").lower()
    out: List[Dict[str, Any]] = []
    for m in thread.get("messages", []):
        headers = {h["name"].lower(): h["value"]
                   for h in (m.get("payload") or {}).get("headers", [])}
        sender = parseaddr(headers.get("from", ""))[1].lower()
        if not sender or sender == ours:
            continue
        out.append({
            "provider_message_id": m["id"],
            "from": sender,
            "subject": headers.get("subject", ""),
            "snippet": m.get("snippet", ""),
            "at": headers.get("date", ""),
        })
    return out


# ----------------------------- Microsoft Graph ---------------------------------
def ms_auth_url(state: str) -> str:
    if MS_MOCKED:
        return ""
    from urllib.parse import urlencode
    q = urlencode({
        "client_id": MS_CLIENT_ID, "response_type": "code",
        "redirect_uri": MS_REDIRECT_URI, "response_mode": "query",
        "scope": MS_SCOPES, "state": state,
    })
    return f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{q}"


async def ms_exchange(code: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={"client_id": MS_CLIENT_ID, "client_secret": MS_CLIENT_SECRET,
                  "code": code, "grant_type": "authorization_code",
                  "redirect_uri": MS_REDIRECT_URI, "scope": MS_SCOPES},
        )
        r.raise_for_status()
        d = r.json()
    return {"access_token": d["access_token"], "refresh_token": d.get("refresh_token"),
            "expiry": None}


async def _ms_token(mailbox: Dict[str, Any]) -> str:
    """Graph access tokens live ~1h, so refresh on every use rather than tracking
    expiry — the refresh call is cheap next to a send."""
    refresh = decrypt_token(mailbox.get("refresh_token_enc"))
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={"client_id": MS_CLIENT_ID, "client_secret": MS_CLIENT_SECRET,
                  "refresh_token": refresh, "grant_type": "refresh_token",
                  "scope": MS_SCOPES},
        )
        r.raise_for_status()
        return r.json()["access_token"]


async def _ms_send(mailbox: Dict[str, Any], msg: EmailMessage) -> Dict[str, Any]:
    token = await _ms_token(mailbox)
    raw = base64.b64encode(msg.as_bytes()).decode()
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post(
            "https://graph.microsoft.com/v1.0/me/sendMail",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "text/plain"},
            content=raw,
        )
        r.raise_for_status()
    # Graph's sendMail returns 202 with no body — the Message-ID we generated is
    # the only handle we get.
    return {"provider_message_id": msg["Message-ID"], "thread_id": None,
            "message_id_header": msg["Message-ID"], "mocked": False}


# ----------------------------- Zoho Mail --------------------------------------
def zoho_auth_url(state: str) -> str:
    if ZOHO_MOCKED:
        return ""
    from urllib.parse import urlencode
    q = urlencode({
        "scope": ZOHO_SCOPES, "client_id": ZOHO_CLIENT_ID,
        "response_type": "code", "access_type": "offline",
        "redirect_uri": ZOHO_REDIRECT_URI, "state": state,
    })
    return f"{ZOHO_ACCOUNTS_URL}/oauth/v2/auth?{q}"


async def zoho_exchange(code: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{ZOHO_ACCOUNTS_URL}/oauth/v2/token",
            data={"client_id": ZOHO_CLIENT_ID, "client_secret": ZOHO_CLIENT_SECRET,
                  "code": code, "grant_type": "authorization_code",
                  "redirect_uri": ZOHO_REDIRECT_URI, "scope": ZOHO_SCOPES},
        )
        r.raise_for_status()
        d = r.json()
    return {"access_token": d["access_token"], "refresh_token": d.get("refresh_token"),
            "expiry": None}


async def _zoho_token(mailbox: Dict[str, Any]) -> str:
    """Zoho access tokens live ~1h, so refresh on every use — same tradeoff as
    the Graph flow: the refresh call is cheap next to a send."""
    refresh = decrypt_token(mailbox.get("refresh_token_enc"))
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{ZOHO_ACCOUNTS_URL}/oauth/v2/token",
            data={"client_id": ZOHO_CLIENT_ID, "client_secret": ZOHO_CLIENT_SECRET,
                  "refresh_token": refresh, "grant_type": "refresh_token"},
        )
        r.raise_for_status()
        return r.json()["access_token"]


async def _zoho_account_id(token: str) -> str:
    """Send goes through /api/accounts/{accountId}/messages — the accountId
    must be looked up per token."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{ZOHO_API_URL}/accounts",
                             headers={"Authorization": f"Zoho-oauthtoken {token}"})
        r.raise_for_status()
        return r.json()["data"][0]["accountId"]


async def _zoho_send(mailbox: Dict[str, Any], msg: EmailMessage) -> Dict[str, Any]:
    token = await _zoho_token(mailbox)
    account_id = await _zoho_account_id(token)
    html_part = msg.get_body(preferencelist=("html",))
    text_part = msg.get_body(preferencelist=("plain",))
    # The Zoho API takes a single content field; prefer the HTML body for
    # rendering, fall back to the text part when there is none.
    if html_part:
        content, mail_format = html_part.get_content(), "html"
    else:
        content, mail_format = (text_part or msg).get_content(), "plain"
    payload = {
        "fromAddress": mailbox["email"],
        "toAddress": msg["To"],
        "subject": msg["Subject"],
        "content": content,
        "mailFormat": mail_format,
    }
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post(
            f"{ZOHO_API_URL}/accounts/{account_id}/messages",
            headers={"Authorization": f"Zoho-oauthtoken {token}"},
            json=payload,
        )
        r.raise_for_status()
        d = r.json()
    mid = ((d.get("data") or {}) or {}).get("messageId") if isinstance(d.get("data"), dict) else None
    return {"provider_message_id": mid or f"zoho-{msg['Message-ID']}",
            "thread_id": None, "message_id_header": msg["Message-ID"], "mocked": False}


# ----------------------------- Public API --------------------------------------
async def send(mailbox: Dict[str, Any], *, to_addr: str, subject: str,
                html: str, text: str, reply_to: Optional[str] = None) -> Dict[str, Any]:
    """Send one email from a connected mailbox. Raises on a real failure — the
    send queue needs to know, so it can retry or quarantine the lead."""
    provider = mailbox.get("provider", "gmail")
    msg = build_mime(
        from_addr=mailbox["email"], from_name=mailbox.get("display_name", ""),
        to_addr=to_addr, subject=subject, html=html, text=text, reply_to=reply_to,
    )

    mocked = not mailbox.get("refresh_token_enc") or (
        (provider == "gmail" and GMAIL_MOCKED)
        or (provider == "outlook" and MS_MOCKED)
        or (provider == "zoho" and ZOHO_MOCKED)
    )
    if mocked:
        return {"provider_message_id": f"mock-{make_msgid()[:24]}",
                "thread_id": None, "message_id_header": msg["Message-ID"], "mocked": True}

    import asyncio
    if provider == "gmail":
        return await asyncio.to_thread(_gmail_send, mailbox, msg)
    if provider == "zoho":
        return await _zoho_send(mailbox, msg)
    return await _ms_send(mailbox, msg)


async def fetch_replies(mailbox: Dict[str, Any], thread_id: Optional[str]) -> List[Dict[str, Any]]:
    """Poll a thread for inbound replies. Gmail only for now — Graph needs a
    different (subscription-based) mechanism."""
    if not thread_id or GMAIL_MOCKED or mailbox.get("provider") != "gmail" \
            or not mailbox.get("refresh_token_enc"):
        return []
    import asyncio
    try:
        return await asyncio.to_thread(_gmail_fetch_replies, mailbox, thread_id)
    except Exception as ex:
        log.info("reply poll failed: %s", ex)
        return []


# ----------------------------- Real DNS checks ---------------------------------
async def check_dns(domain: str) -> Dict[str, Any]:
    """Actually resolve SPF/DKIM/DMARC. The old dns-check route just set all three
    to True, which is worse than not checking — it told users their deliverability
    was fine when it wasn't."""
    import asyncio
    import dns.resolver

    def _txt(name: str) -> List[str]:
        try:
            return [b"".join(r.strings).decode(errors="ignore")
                    for r in dns.resolver.resolve(name, "TXT", lifetime=5)]
        except Exception:
            return []

    d = (domain or "").strip().lower()
    if not d:
        return {"spf": False, "dkim": False, "dmarc": False, "checked": False}

    spf_records, dmarc_records, dkim_records = await asyncio.gather(
        asyncio.to_thread(_txt, d),
        asyncio.to_thread(_txt, f"_dmarc.{d}"),
        # Selector is guesswork without provider context; google's is the common one.
        asyncio.to_thread(_txt, f"google._domainkey.{d}"),
    )

    spf = any(r.startswith("v=spf1") for r in spf_records)
    dmarc_txt = next((r for r in dmarc_records if r.startswith("v=DMARC1")), "")
    dkim = any("v=DKIM1" in r or "k=rsa" in r for r in dkim_records)

    policy = ""
    if dmarc_txt:
        m = re.search(r"\bp=(\w+)", dmarc_txt)
        policy = m.group(1) if m else ""

    return {
        "spf": spf, "dkim": dkim, "dmarc": bool(dmarc_txt),
        "dmarc_policy": policy, "checked": True, "domain": d,
    }
