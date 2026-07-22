"""Thin async wrapper around the Twilio REST API — shared by Voice EQ (call
placement), SMS EQ, and WhatsApp EQ (Programmable Messaging).

Falls back to deterministic mock responses when TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN
are unset — every provider built on this client is fully demoable without a Twilio
account.

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

# WhatsApp-via-Twilio needs its own sending number (a WhatsApp-enabled Twilio
# number or the Twilio sandbox number) — SMS reuses TWILIO_FROM_NUMBER above,
# WhatsApp does not, since a single Twilio number is rarely provisioned for both.
WHATSAPP_FROM_NUMBER = os.environ.get("WHATSAPP_FROM_NUMBER", "")
WHATSAPP_MOCKED = TWILIO_MOCKED or not bool(WHATSAPP_FROM_NUMBER)


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
        the media-stream WebSocket — see voice_ws_bridge.py."""
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
        """Used to enforce max_call_duration_minutes — see voice_ws_bridge.py's duration timer."""
        if TWILIO_MOCKED or call_sid.startswith("mock-"):
            return
        await asyncio.to_thread(self._sdk.calls(call_sid).update, status="completed")

    async def send_sms(self, *, to_number: str, body: str,
                        from_number: Optional[str] = None,
                        status_callback_url: Optional[str] = None) -> Dict[str, Any]:
        """Programmable Messaging — plain SMS. Defaults to TWILIO_FROM_NUMBER."""
        sender = from_number or TWILIO_FROM_NUMBER
        if TWILIO_MOCKED:
            return {
                "message_id": _mock_id("sms"), "status": "queued",
                "from_number": sender, "to_number": to_number, "mocked": True,
            }
        kwargs: Dict[str, Any] = {"to": to_number, "from_": sender, "body": body}
        if status_callback_url:
            kwargs["status_callback"] = status_callback_url
        msg = await asyncio.to_thread(self._sdk.messages.create, **kwargs)
        return {
            "message_id": msg.sid, "status": msg.status,
            "from_number": sender, "to_number": to_number, "mocked": False,
        }

    async def send_whatsapp(self, *, to_number: str, body: str,
                             content_sid: Optional[str] = None,
                             content_variables: Optional[Dict[str, str]] = None,
                             status_callback_url: Optional[str] = None) -> Dict[str, Any]:
        """Programmable Messaging over WhatsApp. `content_sid` + `content_variables`
        send an approved template (the only way to open/re-open a conversation
        outside the 24h session window); a plain `body` is a freeform session
        message, only valid while a session is open."""
        if WHATSAPP_MOCKED:
            return {
                "message_id": _mock_id("wa"), "status": "queued",
                "from_number": WHATSAPP_FROM_NUMBER, "to_number": to_number, "mocked": True,
            }
        kwargs: Dict[str, Any] = {
            "to": f"whatsapp:{to_number}", "from_": f"whatsapp:{WHATSAPP_FROM_NUMBER}",
        }
        if content_sid:
            kwargs["content_sid"] = content_sid
            if content_variables:
                import json as _json
                kwargs["content_variables"] = _json.dumps(content_variables)
        else:
            kwargs["body"] = body
        if status_callback_url:
            kwargs["status_callback"] = status_callback_url
        msg = await asyncio.to_thread(self._sdk.messages.create, **kwargs)
        return {
            "message_id": msg.sid, "status": msg.status,
            "from_number": WHATSAPP_FROM_NUMBER, "to_number": to_number, "mocked": False,
        }

    def verify_webhook_signature(self, url: str, params: Dict[str, str], signature: str) -> bool:
        """Twilio signs its POSTed webhooks (TwiML fetch, status callbacks) with
        an X-Twilio-Signature header — HMAC-SHA1 over the full URL + sorted form
        params, keyed on the auth token. This is NOT used for the media-stream
        WebSocket itself, which has no signature scheme of its own; that route's
        auth is the token-in-path."""
        if TWILIO_MOCKED:
            return True
        from twilio.request_validator import RequestValidator
        return RequestValidator(TWILIO_AUTH_TOKEN).validate(url, params, signature)


twilio_client = TwilioClient()
