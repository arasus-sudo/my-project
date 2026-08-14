"""Shared LLM utility — thin wrapper around Phi-4-mini-instruct/Claude API.

Mirrors the signature of server._llm_chat so any module can call the
same rate-limited, retry-wrapped chat endpoint without circular imports.
Metering lives in server._llm_chat (token_usage_log); this copy is for
paths that must avoid importing server (it skips metering/quota).
"""
import os, asyncio, logging
from typing import Any, Dict, Optional

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment-driven configuration – set these via your deployment env:
#   PHI4_API_KEY    – your Phi-4-mini-instruct serverless secret key
#   PHI4_BASE_URL   – your serverless endpoint (e.g.
#                     https://phi4-deployment.azure.com/openai/v1)
#   PHI4_MODEL      – model name as known by the deployment
#                     (default: "phi-4-mini-instruct")
#   (LLM_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY are kept for
#    backward-compatible auto‑routing, but the default auto order now
#    prefers the Phi-4 key when present.)
# ---------------------------------------------------------------------------
PHI4_API_KEY = os.environ.get("PHI4_API_KEY", "")
PHI4_BASE_URL = os.environ.get("PHI4_BASE_URL", "https://agenticsuite-resource.services.ai.azure.com/openai/v1")
PHI4_MODEL = os.environ.get("PHI4_MODEL", "phi-4-mini-instruct")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
PERPLEXITY_MODEL = os.environ.get("PERPLEXITY_MODEL", "sonar-pro")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.perplexity.ai")

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "auto").strip().lower()


def resolve_provider(requested: Optional[str] = None) -> str:
    """Phi-4-mini-instruct | Anthropic | OpenAI — explicit > LLM_PROVIDER env > auto.
    (Phi-4 first, then Anthropic, then OpenAI)."""
    if requested:
        p = requested.strip().lower()
        if p in ("phi-4", "anthropic", "openai"):
            return p
        raise RuntimeError(f"unknown LLM provider: {requested}")
    if LLM_PROVIDER in ("phi-4", "anthropic", "openai"):
        return LLM_PROVIDER
    if PHI4_API_KEY:
        return "phi-4"
    if ANTHROPIC_API_KEY:
        return "anthropic"
    if OPENAI_API_KEY:
        return "openai"
    raise RuntimeError("no LLM API key configured (set PHI4_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY)")


async def llm_chat(system: str, user_text: str, session_id: str,
                   user: Optional[Dict[str, Any]] = None,
                   max_tokens: int = 2048,
                   provider: Optional[str] = None,
                   model: Optional[str] = None) -> str:
    prov = resolve_provider(provider)
    if prov == "anthropic":
        return await _chat_anthropic(system, user_text, max_tokens, model)
    if prov == "openai":
        return await _chat_openai(system, user_text, max_tokens, model)
    return await _chat_phi4(system, user_text, max_tokens, model)


async def _chat_perplexity(system: str, user_text: str, max_tokens: int, model: Optional[str]) -> str:
    import openai
    client = openai.AsyncOpenAI(api_key=PERPLEXITY_API_KEY, base_url=LLM_BASE_URL)
    mdl = model or PERPLEXITY_MODEL
    last_err = None
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(
                model=mdl,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_text},
                ],
            )
            return resp.choices[0].message.content or ""
        except openai.RateLimitError as ex:
            last_err = ex
            await asyncio.sleep(2 ** attempt)
        except Exception as ex:
            raise RuntimeError(f"LLM call failed: {ex}") from ex
    raise RuntimeError(f"LLM call failed after retries: {last_err}")


async def _chat_openai(system: str, user_text: str, max_tokens: int, model: Optional[str]) -> str:
    import openai
    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    mdl = model or OPENAI_MODEL
    last_err = None
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(
                model=mdl,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_text},
                ],
            )
            return resp.choices[0].message.content or ""
        except openai.RateLimitError as ex:
            last_err = ex
            await asyncio.sleep(2 ** attempt)
        except Exception as ex:
            raise RuntimeError(f"LLM call failed: {ex}") from ex
    raise RuntimeError(f"LLM call failed after retries: {last_err}")


async def _chat_phi4(system: str, user_text: str, max_tokens: int, model: Optional[str]) -> str:
    import openai
    client = openai.AsyncOpenAI(api_key=PHI4_API_KEY, base_url=PHI4_BASE_URL)
    mdl = model or PHI4_MODEL
    last_err = None
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(
                model=mdl,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_text},
                ],
            )
            return resp.choices[0].message.content or ""
        except openai.RateLimitError as ex:
            last_err = ex
            await asyncio.sleep(2 ** attempt)
        except Exception as ex:
            raise RuntimeError(f"LLM call failed: {ex}") from ex
    raise RuntimeError(f"LLM call failed after retries: {last_err}")
