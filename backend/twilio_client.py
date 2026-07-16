"""Thin async wrapper around the Twilio REST API — call placement for Voice EQ's
Twilio + OpenAI Realtime provider.

Falls back to deterministic mock responses when TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN
are unset, mirroring retell_client.py's "mocked": True convention — this provider
is fully demoable without a Twilio account, same as Retell.

twilio-python's REST client is synchronous; every call here runs it via
asyncio.to_thread so an await-based caller never blocks the event loop on a
network round trip.
"""

import asyncio
import os
import uuid
from typing import Any, Dict, Optional

TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.environ.get("TWILIO_FROM_NUMBER", "")
TWILIO_MOCKED = not bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)


def _mock_id(prefix: str) -> str:
    return f"mock-{prefix}-{uuid.uuid4().hex[:10]}"


class TwilioClient:
    def __init__(self):
        self._sdk = None
        if not TWILIO_MOCKED:
            from twilio.rest import Client
            self._sdk = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

    async def create_phone_call(self, *, from_number: str, to_number: str, twiml_url: str,
                                 status_callback_url: Optional[str] = None,
                                 voicemail_detection: bool = False,
                                 record: bool = True) -> Dict[str, Any]:
        """Places the outbound call. `twiml_url` is fetched by Twilio the moment
        the call connects and must return the <Connect><Stream> TwiML that opens
        the media-stream WebSocket — see voice_ws_bridge.py. Return shape matches
        retell_client.create_phone_call so the caller (voice_eq.py) can build a
        call doc without branching on provider."""
        if TWILIO_MOCKED:
            return {
                "call_id": _mock_id("call"), "call_status": "registered",
                "from_number": from_number, "to_number": to_number,
                "direction": "outbound", "mocked": True,
            }
        kwargs: Dict[str, Any] = {"to": to_number, "from_": from_number, "url": twiml_url, "method": "POST"}
        if status_callback_url:
            kwargs["status_callback"] = status_callback_url
            kwargs["status_callback_event"] = ["initiated", "ringing", "answered", "completed"]
            kwargs["status_callback_method"] = "POST"
        if voicemail_detection:
            # Async AMD: Twilio posts the AnsweredBy result to a separate
            # callback rather than blocking call setup on the detection result.
            kwargs["machine_detection"] = "DetectMessageEnd"
            kwargs["async_amd"] = True
            if status_callback_url:
                kwargs["async_amd_status_callback"] = status_callback_url
                kwargs["async_amd_status_callback_method"] = "POST"
        if record:
            kwargs["record"] = True
        call = await asyncio.to_thread(self._sdk.calls.create, **kwargs)
        return {
            "call_id": call.sid, "call_status": call.status,
            "from_number": from_number, "to_number": to_number,
            "direction": "outbound", "mocked": False,
        }

    async def get_call(self, call_sid: str) -> Optional[Dict[str, Any]]:
        if TWILIO_MOCKED or call_sid.startswith("mock-"):
            return None
        call = await asyncio.to_thread(self._sdk.calls(call_sid).fetch)
        return {"sid": call.sid, "status": call.status, "duration": call.duration}

    async def hangup_call(self, call_sid: str) -> None:
        """Used to enforce max_call_duration_minutes — Retell does this
        server-side on its own infra; nothing does it for this provider unless
        the bridge does, see voice_ws_bridge.py's duration timer."""
        if TWILIO_MOCKED or call_sid.startswith("mock-"):
            return
        await asyncio.to_thread(self._sdk.calls(call_sid).update, status="completed")

    def verify_webhook_signature(self, url: str, params: Dict[str, str], signature: str) -> bool:
        """Twilio signs its POSTed webhooks (TwiML fetch, status callbacks) with
        an X-Twilio-Signature header — HMAC-SHA1 over the full URL + sorted form
        params, keyed on the auth token. This is NOT used for the media-stream
        WebSocket itself, which has no signature scheme of its own; that route's
        auth is the token-in-path, same design as the existing Retell webhook."""
        if TWILIO_MOCKED:
            return True
        from twilio.request_validator import RequestValidator
        return RequestValidator(TWILIO_AUTH_TOKEN).validate(url, params, signature)


twilio_client = TwilioClient()
