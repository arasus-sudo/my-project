"""Thin wrapper around the Google Calendar API (OAuth2, authorization-code flow).

Falls back to deterministic mock behavior when GOOGLE_CLIENT_ID/SECRET are unset,
so Schedule EQ (event types, availability, booking) is fully demoable without a
Google Cloud project — mirrors the RETELL_MOCKED convention.
"""

import os
import uuid
from typing import Any, Dict, List, Optional
from cryptography.fernet import Fernet

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
# Calendar's OAuth callback is /api/schedule-eq/oauth/callback, but the shared
# GOOGLE_REDIRECT_URI env var points at Pitch EQ's mailbox callback — without
# this override, Calendar consent round-trips would land on the wrong route.
GOOGLE_REDIRECT_URI = (os.environ.get("GOOGLE_CALENDAR_REDIRECT_URI")
                        or os.environ.get("GOOGLE_REDIRECT_URI", ""))
GOOGLE_MOCKED = not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

# Accept scope supersets on token exchange — Google merges previously granted
# scopes (openid/email/profile from Google sign-in) into new tokens, which
# oauthlib otherwise rejects with "Scope has changed". See mailbox_client.py.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

SCOPES = ["https://www.googleapis.com/auth/calendar"]

TOKEN_ENCRYPTION_KEY = os.environ.get("TOKEN_ENCRYPTION_KEY", "")
_fernet = Fernet(TOKEN_ENCRYPTION_KEY.encode()) if TOKEN_ENCRYPTION_KEY else None


def encrypt_token(raw: Optional[str]) -> Optional[str]:
    if not raw or not _fernet:
        return raw
    return _fernet.encrypt(raw.encode()).decode()


def decrypt_token(enc: Optional[str]) -> Optional[str]:
    if not enc or not _fernet:
        return enc
    return _fernet.decrypt(enc.encode()).decode()


def _client_config() -> Dict[str, Any]:
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }


class GoogleCalendarClient:
    # autogenerate_code_verifier=False on both flows — same reasoning as
    # mailbox_client.py: URL generation and token exchange use separate Flow
    # instances across two requests, so default-on PKCE fails the exchange with
    # "(invalid_grant) Missing code verifier". Confidential client; the secret
    # authenticates the exchange.
    def get_auth_url(self, state: str) -> str:
        if GOOGLE_MOCKED:
            return ""
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI,
                                        autogenerate_code_verifier=False)
        auth_url, _ = flow.authorization_url(
            access_type="offline", prompt="consent", state=state, include_granted_scopes="true",
        )
        return auth_url

    def exchange_code(self, code: str) -> Dict[str, Any]:
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI,
                                        autogenerate_code_verifier=False)
        flow.fetch_token(code=code)
        creds = flow.credentials
        return {
            "access_token": creds.token,
            "refresh_token": creds.refresh_token,
            "expiry": creds.expiry.isoformat() if creds.expiry else None,
        }

    def _credentials(self, integration: Dict[str, Any]):
        from google.oauth2.credentials import Credentials
        return Credentials(
            token=decrypt_token(integration.get("access_token_enc")),
            refresh_token=decrypt_token(integration.get("refresh_token_enc")),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            scopes=SCOPES,
        )

    def freebusy(self, integration: Optional[Dict[str, Any]], time_min: str, time_max: str) -> List[Dict[str, str]]:
        """Busy blocks as [{start, end}] ISO strings. Mocked/no-integration: no external busy time."""
        if GOOGLE_MOCKED or not integration:
            return []
        from googleapiclient.discovery import build
        service = build("calendar", "v3", credentials=self._credentials(integration))
        cal_id = integration.get("calendar_id") or "primary"
        resp = service.freebusy().query(body={
            "timeMin": time_min, "timeMax": time_max, "items": [{"id": cal_id}],
        }).execute()
        return resp.get("calendars", {}).get(cal_id, {}).get("busy", [])

    def create_event(self, integration: Optional[Dict[str, Any]], *, summary: str, description: str,
                      start_iso: str, end_iso: str, tz: str, attendee_email: str,
                      want_meet_link: bool = True) -> Dict[str, Any]:
        if GOOGLE_MOCKED or not integration:
            return {"event_id": f"mock-evt-{uuid.uuid4().hex[:10]}", "meet_link": None, "mocked": True}
        from googleapiclient.discovery import build
        service = build("calendar", "v3", credentials=self._credentials(integration))
        body: Dict[str, Any] = {
            "summary": summary, "description": description,
            "start": {"dateTime": start_iso, "timeZone": tz},
            "end": {"dateTime": end_iso, "timeZone": tz},
            "attendees": [{"email": attendee_email}],
        }
        if want_meet_link:
            body["conferenceData"] = {"createRequest": {
                "requestId": str(uuid.uuid4()), "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }}
        ev = service.events().insert(
            calendarId=integration.get("calendar_id") or "primary", body=body,
            conferenceDataVersion=1 if want_meet_link else 0, sendUpdates="all",
        ).execute()
        meet_link = None
        for ep in (ev.get("conferenceData") or {}).get("entryPoints", []):
            if ep.get("entryPointType") == "video":
                meet_link = ep.get("uri")
        return {"event_id": ev["id"], "meet_link": meet_link, "mocked": False}

    def move_event(self, integration: Optional[Dict[str, Any]], event_id: Optional[str], *,
                    start_iso: str, end_iso: str, tz: str) -> Dict[str, Any]:
        """Reschedule: patch the existing event's times rather than deleting and
        recreating, so the guest's calendar entry moves (and keeps its Meet link)
        instead of vanishing and reappearing."""
        if GOOGLE_MOCKED or not integration or not event_id or event_id.startswith("mock-"):
            return {"event_id": event_id, "mocked": True}
        from googleapiclient.discovery import build
        service = build("calendar", "v3", credentials=self._credentials(integration))
        try:
            ev = service.events().patch(
                calendarId=integration.get("calendar_id") or "primary", eventId=event_id,
                body={
                    "start": {"dateTime": start_iso, "timeZone": tz},
                    "end": {"dateTime": end_iso, "timeZone": tz},
                },
                sendUpdates="all",
            ).execute()
            return {"event_id": ev["id"], "mocked": False}
        except Exception:
            return {"event_id": event_id, "mocked": False, "error": True}

    def delete_event(self, integration: Optional[Dict[str, Any]], event_id: Optional[str]) -> None:
        if GOOGLE_MOCKED or not integration or not event_id or event_id.startswith("mock-"):
            return
        from googleapiclient.discovery import build
        service = build("calendar", "v3", credentials=self._credentials(integration))
        try:
            service.events().delete(
                calendarId=integration.get("calendar_id") or "primary", eventId=event_id, sendUpdates="all",
            ).execute()
        except Exception:
            pass


google_calendar_client = GoogleCalendarClient()
