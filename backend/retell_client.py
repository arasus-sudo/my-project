"""Thin async wrapper around the Retell AI API (retell-sdk).

Falls back to deterministic mock responses when RETELL_API_KEY is unset, so
the whole Voice EQ feature (agent CRUD, campaign launch, call logs, webhook
cascade) is fully demoable without a Retell account — mirrors the
"mocked": True convention already used for the HubSpot integration.
"""

import os
import uuid
from typing import Any, Dict, List, Optional

RETELL_API_KEY = os.environ.get("RETELL_API_KEY", "")
RETELL_MOCKED = not bool(RETELL_API_KEY)


def _mock_id(prefix: str) -> str:
    return f"mock-{prefix}-{uuid.uuid4().hex[:10]}"


class RetellClient:
    def __init__(self):
        self._sdk = None
        if not RETELL_MOCKED:
            from retell import AsyncRetell
            self._sdk = AsyncRetell(api_key=RETELL_API_KEY)

    def _transfer_tool(self, warm_transfer_number):
        if not warm_transfer_number:
            return None
        return {
            "type": "transfer_call", "name": "transfer_to_human",
            "description": "Transfer the call to a human teammate when the caller asks for a person or the request is out of scope.",
            "transfer_destination": {"type": "predefined", "number": warm_transfer_number},
            "transfer_option": {"type": "cold_transfer"},
        }

    async def create_llm(self, general_prompt: str, model: str = "claude-5-sonnet",
                          begin_message: Optional[str] = None,
                          warm_transfer_number: Optional[str] = None) -> Dict[str, Any]:
        if RETELL_MOCKED:
            return {"llm_id": _mock_id("llm"), "mocked": True}
        kwargs: Dict[str, Any] = {"general_prompt": general_prompt, "model": model, "begin_message": begin_message or ""}
        tool = self._transfer_tool(warm_transfer_number)
        if tool:
            kwargs["general_tools"] = [tool]
        # The transfer-tool schema is version-sensitive; if Retell rejects it,
        # still create the LLM (without the tool) so agent sync never hard-fails.
        try:
            resp = await self._sdk.llm.create(**kwargs)
        except Exception:
            if "general_tools" not in kwargs:
                raise
            kwargs.pop("general_tools", None)
            resp = await self._sdk.llm.create(**kwargs)
        return {"llm_id": resp.llm_id, "mocked": False}

    async def update_llm(self, llm_id: str, general_prompt: str, begin_message: Optional[str] = None,
                          warm_transfer_number: Optional[str] = None) -> Dict[str, Any]:
        if RETELL_MOCKED:
            return {"llm_id": llm_id, "mocked": True}
        kwargs: Dict[str, Any] = {"general_prompt": general_prompt, "begin_message": begin_message or ""}
        tool = self._transfer_tool(warm_transfer_number)
        if tool:
            kwargs["general_tools"] = [tool]
        try:
            resp = await self._sdk.llm.update(llm_id, **kwargs)
        except Exception:
            if "general_tools" not in kwargs:
                raise
            kwargs.pop("general_tools", None)
            resp = await self._sdk.llm.update(llm_id, **kwargs)
        return {"llm_id": resp.llm_id, "mocked": False}

    async def create_agent(self, *, llm_id: str, voice_id: str, agent_name: str, language: str = "en-US",
                            voicemail_detection: bool = True,
                            post_call_analysis_fields: Optional[List[Dict[str, str]]] = None,
                            webhook_url: Optional[str] = None,
                            max_call_duration_ms: Optional[int] = None,
                            ambient_sound: Optional[str] = None,
                            voice_speed: Optional[float] = None,
                            voice_temperature: Optional[float] = None) -> Dict[str, Any]:
        if RETELL_MOCKED:
            return {"agent_id": _mock_id("agent"), "mocked": True}
        kwargs: Dict[str, Any] = {}
        if voicemail_detection:
            kwargs["voicemail_option"] = {"action": {"type": "hangup"}}
        if post_call_analysis_fields:
            kwargs["post_call_analysis_data"] = [
                {"name": f["key"], "description": f.get("prompt", f["key"]), "type": "string", "required": False}
                for f in post_call_analysis_fields
            ]
        if webhook_url:
            kwargs["webhook_url"] = webhook_url
        if max_call_duration_ms:
            kwargs["max_call_duration_ms"] = max_call_duration_ms
        if ambient_sound and ambient_sound != "none":
            kwargs["ambient_sound"] = ambient_sound
        if voice_speed and voice_speed != 1.0:
            kwargs["voice_speed"] = voice_speed
        if voice_temperature is not None and voice_temperature != 1.0:
            kwargs["voice_temperature"] = voice_temperature
        resp = await self._sdk.agent.create(
            response_engine={"type": "retell-llm", "llm_id": llm_id},
            voice_id=voice_id, agent_name=agent_name, language=language,
            **kwargs,
        )
        return {"agent_id": resp.agent_id, "mocked": False}

    async def update_agent(self, agent_id: str, **fields: Any) -> Dict[str, Any]:
        if RETELL_MOCKED:
            return {"agent_id": agent_id, "mocked": True}
        resp = await self._sdk.agent.update(agent_id, **fields)
        return {"agent_id": resp.agent_id, "mocked": False}

    async def list_phone_numbers(self) -> List[Dict[str, Any]]:
        if RETELL_MOCKED:
            return []
        resp = await self._sdk.phone_number.list()
        return [n.model_dump() for n in resp.items]

    async def import_phone_number(self, phone_number: str, nickname: str = "") -> Dict[str, Any]:
        if RETELL_MOCKED:
            return {"phone_number": phone_number, "phone_number_pretty": phone_number,
                    "nickname": nickname, "mocked": True}
        resp = await self._sdk.phone_number.create(phone_number=phone_number, nickname=nickname)
        return {**resp.model_dump(), "mocked": False}

    async def create_phone_call(self, *, from_number: str, to_number: str, agent_id: Optional[str] = None,
                                 metadata: Optional[Dict[str, Any]] = None,
                                 dynamic_variables: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        if RETELL_MOCKED:
            return {
                "call_id": _mock_id("call"), "call_status": "registered",
                "agent_id": agent_id, "from_number": from_number, "to_number": to_number,
                "direction": "outbound", "mocked": True,
            }
        kwargs: Dict[str, Any] = {"from_number": from_number, "to_number": to_number}
        if agent_id:
            kwargs["override_agent_id"] = agent_id
        if metadata:
            kwargs["metadata"] = metadata
        if dynamic_variables:
            kwargs["retell_llm_dynamic_variables"] = dynamic_variables
        resp = await self._sdk.call.create_phone_call(**kwargs)
        return {
            "call_id": resp.call_id, "call_status": resp.call_status,
            "agent_id": resp.agent_id, "from_number": resp.from_number, "to_number": resp.to_number,
            "direction": resp.direction, "mocked": False,
        }

    async def get_call(self, call_id: str) -> Optional[Dict[str, Any]]:
        if RETELL_MOCKED or call_id.startswith("mock-"):
            return None
        resp = await self._sdk.call.retrieve(call_id)
        return resp.model_dump()

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        if RETELL_MOCKED:
            return True
        from retell.lib import verify
        return verify(raw_body.decode("utf-8"), api_key=RETELL_API_KEY, signature=signature)


retell_client = RetellClient()
