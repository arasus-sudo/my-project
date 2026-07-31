"""Live LLM provider probe — verifies the shared _llm_chat layer against real
provider keys (Perplexity + Anthropic). Usage:

    $env:PERPLEXITY_API_KEY = "..."     # optional
    $env:ANTHROPIC_API_KEY = "..."      # optional
    python llm_probe.py
    python llm_probe.py perplexity      # force one provider
    python llm_probe.py anthropic
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import _llm_chat, _resolve_provider, _llm_configured, PERPLEXITY_MODEL, ANTHROPIC_MODEL, OPENAI_MODEL  # noqa: E402

SYSTEM = "You are a test assistant. Reply in one short sentence."
USER = "Say hello and name your model."


async def probe(provider=None):
    try:
        resolved = _resolve_provider(provider)
    except RuntimeError as ex:
        print(f"[skip] {ex}")
        return
    model = {"perplexity": PERPLEXITY_MODEL, "anthropic": ANTHROPIC_MODEL, "openai": OPENAI_MODEL}[resolved]
    print(f"→ provider={resolved}  model={model}")
    try:
        reply = await _llm_chat(SYSTEM, USER, "probe", provider=provider)
        print(f"  ok: {reply.strip()[:200]}")
    except RuntimeError as ex:
        print(f"  FAIL: {ex}")


async def main():
    print(f"configured: {_llm_configured()}  LLM_PROVIDER={os.environ.get('LLM_PROVIDER', 'auto')}")
    forced = sys.argv[1] if len(sys.argv) > 1 else None
    if forced:
        await probe(forced)
    else:
        await probe(None)
        await probe("perplexity")
        await probe("anthropic")
        await probe("openai")


if __name__ == "__main__":
    asyncio.run(main())
