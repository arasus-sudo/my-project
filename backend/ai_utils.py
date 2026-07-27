"""Shared LLM utility — thin wrapper around Perplexity/Claude API.

Mirrors the signature of server._llm_chat so any module can call the
same rate-limited, retry-wrapped chat endpoint without circular imports.
"""
import os, asyncio, logging
from typing import Any, Dict, Optional

log = logging.getLogger(__name__)

PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "") or os.environ.get("ANTHROPIC_API_KEY", "")
PERPLEXITY_MODEL = os.environ.get("PERPLEXITY_MODEL", "sonar-pro")


async def llm_chat(system: str, user_text: str, session_id: str,
                   user: Optional[Dict[str, Any]] = None,
                   max_tokens: int = 2048) -> str:
    if not PERPLEXITY_API_KEY:
        raise RuntimeError("no LLM API key configured (PERPLEXITY_API_KEY or ANTHROPIC_API_KEY)")
    import openai
    base_url = os.environ.get("LLM_BASE_URL", "https://api.perplexity.ai")
    client = openai.AsyncOpenAI(api_key=PERPLEXITY_API_KEY, base_url=base_url)
    last_err = None
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(
                model=PERPLEXITY_MODEL,
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
