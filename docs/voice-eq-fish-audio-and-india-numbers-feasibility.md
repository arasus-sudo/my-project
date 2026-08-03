# Voice EQ — Fish Audio provider & Indian number provisioning

**Feasibility assessment · 2026-08-03**

---

## Verdict up front

| Ask | Verdict |
|---|---|
| Add Fish Audio as a calling-agent provider | **Green.** Cheap and structurally easy — your existing `google_provider` is a direct template, and Fish emits 8 kHz PCM natively so no resampling is needed. ~2–4 days. |
| Voice cloning + "auto emphasis" | **Green on engineering, amber on policy.** Cloning is a two-call API. "Auto emphasis" as a toggle **does not exist** — but what does exist is better for us. See §3. |
| Let users buy **Indian** numbers for outbound calling | **Red via Twilio — structurally impossible, not a build problem.** Twilio cannot issue an Indian caller ID for outbound calls into India, at any price. See §5. |
| Let users buy numbers generally (US/UK/etc.) from inside the product | **Green.** Genuinely absent today and worth building. ~1–2 weeks. See §6. |

One finding that may matter more than everything else here: **your current Google provider defaults to `en-US-Studio-Q`, which is Google's $160/1M-character tier** — the most expensive voice they sell, ~10× Fish and ~40× Google's own WaveNet. Changing one string cuts TTS cost by an order of magnitude with no new vendor. Do that regardless of what you decide about Fish.

---

## 1. What Voice EQ does today

Two providers, chosen at agent creation (`VoiceAgentIn.provider`, [voice_eq.py:92](../backend/voice_eq.py); UI at [VoiceAgentBuilder.jsx:250](../frontend/src/pages/VoiceAgentBuilder.jsx)):

| Provider | Shape | Path |
|---|---|---|
| `twilio_openai` (default) | **Speech-to-speech.** One model does STT + reasoning + TTS. | Twilio `<Stream>` ↔ OpenAI Realtime |
| `google_provider` | **Cascaded.** Discrete stages. | Twilio → Google STT → Claude → Google TTS → Twilio |

**Twilio is already the telephony layer for both.** So "add Fish Audio + Twilio" is really *add a third cascaded provider that swaps the TTS stage* — Twilio itself needs no work.

The cascade already handles the hard part: Google TTS is asked for `MULAW` @ `8000 Hz` because Twilio media streams are 8 kHz ([voice_google_provider.py:151](../backend/voice_google_provider.py)). Any new TTS vendor must hit that same target or pay for resampling.

**Numbers today:** `POST /voice-eq/numbers/import` takes a phone-number *string* and stores it. No purchase, no search, no ownership check — [voice_eq.py:712](../backend/voice_eq.py). `twilio_client.py` wraps exactly one call, `create_phone_call`. There is no provisioning code in the product at all.

---

## 2. Fish Audio — integration fit

| Property | Value | Consequence for us |
|---|---|---|
| Endpoint | `POST https://api.fish.audio/v1/tts` | Same shape as the Google TTS call we already make |
| Output formats | mp3, wav, **pcm**, opus | — |
| **PCM sample rates** | **8 kHz**, 16k, 24k, 32k, 44.1k | **The critical one.** Ask for `format=pcm, sample_rate=8000` and you are one `audioop.lin2ulaw()` from Twilio-ready μ-law. No resampling. |
| Latency | `low` / `balanced` / `normal`; ~300 ms TTFA | Comparable to Google; better than our current *batch* approach |
| Streaming | HTTP chunked **and** WebSocket | Lets us stream Claude tokens → Fish → Twilio incrementally, which the Google provider does **not** do today (it waits for the full turn) |
| Voice cloning | `reference_id`, or inline `references` (10–30 s + exact transcript) | Two API calls |
| Prosody | `speed` 0.5–2.0, `volume` dB, `normalize_loudness` | Matches our existing `speaking_speed` / `volume_gain_db` config |
| Price | **$15 / 1M UTF-8 bytes** | English: 1 char = 1 byte. CJK = 3 bytes/char |
| ASR / STT | **Not offered** | Keep Google STT (or Deepgram). Fish replaces *one* stage only |

### Cost, per minute of synthesized speech

At ~150 wpm and ~5.5 bytes/word ≈ **825 bytes per minute** of AI speech:

| TTS engine | $/1M chars | $/min of AI speech | vs today |
|---|---|---|---|
| Google **Studio** (`en-US-Studio-Q` — *your current default*) | $160 | **$0.132** | baseline |
| Google Neural2 | $16 | $0.0132 | 10× cheaper |
| **Fish Audio** (s2.1-pro) | $15 | **$0.0124** | **10.6× cheaper** |
| Google WaveNet | $4 | $0.0033 | 40× cheaper |

For context on the other provider: `gpt-realtime-2.1` runs ~$0.06–0.11/min all-in (STT+LLM+TTS) with caching working, and $0.18–0.46/min without.

**Read this table honestly:** Fish is *not* meaningfully cheaper than Google Neural2, and is 4× *more* expensive than WaveNet. The case for Fish is **not price** — it is voice cloning and word-level expressive control, which no Google tier offers. If cost alone is the goal, switch `google_voice` off Studio and stop there.

### Engineering plan

Clone `voice_google_provider.py` → `voice_fish_provider.py` and swap one function:

1. `_fish_tts(text, reference_id, speed)` → `POST /v1/tts` with `format=pcm, sample_rate=8000`
2. `audioop.lin2ulaw(pcm16, 2)` → base64 → existing Twilio media frame path
3. Keep Google STT, `_gpt_turn`, `_finalize_call`, billing, transcript analysis **unchanged**
4. Add `provider: "twilio_fish"` to the agent model + one `<option>` in the builder

**Risk to note:** `audioop` is deprecated in Python 3.11 (your runtime) and **removed in 3.13**. Use the `audioop-lts` backport or a 6-line numpy μ-law encoder now, so the eventual 3.13 upgrade isn't blocked by this.

---

## 3. "Auto emphasis" — correcting the premise

There is **no auto-emphasis toggle** in the Fish API. Emotion and emphasis are **inline markers inside the `text` field**, not request parameters:

- **S2 / s2.1-pro** — open-domain natural language in `[square brackets]`, placed anywhere:
  `This is [emphasis] really important.` · `[warm and happy] Great to hear from you.`
- **S1 (legacy)** — a fixed tag set in `(parentheses)` at sentence start: `(excited)`, `(chuckling)`, `(in a hurry)`

**This is better for us than a toggle would be.** In the cascaded architecture, Claude already writes the agent's words. So Claude can emit the markers directly, and "auto emphasis" becomes a prompt-engineering feature we control per persona — stress the prospect's name, soften an objection rebuttal, lean on a number. Neither Google TTS (SSML, which we don't even use — we send plain `{"input": {"text": ...}}`) nor OpenAI Realtime (no per-word prosody control) can do this.

**Required guardrail:** those markers must be **stripped** before text reaches any other provider, or Google TTS will read "open bracket emphasis" aloud on air. Put the stripper in the shared path, not in the Fish provider.

---

## 4. Voice cloning — easy build, real policy exposure

Engineering is trivial: upload 10–30 s of audio plus an exact transcript, store the returned `reference_id` on the agent config, pass it at synthesis. Half a day.

The exposure is not engineering:

- Cloning a **real person's** voice needs that person's documented, specific consent. A generic ToS checkbox is not that.
- Several jurisdictions require **disclosure that the caller is an AI** on outbound sales calls. A cloned human voice makes non-disclosure materially worse, not merely non-compliant.
- If you let *customers* upload clone samples, you inherit their consent problem. You need an attestation at upload, retention of who attested, and a takedown path.

Recommendation: ship cloning with **workspace-owned voices only** (their own recorded staff, attested at upload), not arbitrary uploads, and pair it with an AI-disclosure line in the agent's opening. Treat the attestation flow as part of the feature, not a follow-up.

---

## 5. Indian numbers — the hard finding

**You cannot buy an Indian number from Twilio and make outbound calls to Indian consumers with it. This is not a limit you can engineer around.** Three independent constraints, each sufficient on its own:

| Source | Constraint |
|---|---|
| Twilio, India *regulatory* guidelines | Your address **"must be outside of the country"** — an Indian entity cannot hold a Twilio Indian number. Only toll-free **+91800** is offered. |
| Twilio, India *voice* guidelines | **"Outbound calls to India can only be made from international (non-Indian) numbers."** |
| Twilio product notice, eff. 2024-08-01 | Domestic outbound calls from existing Indian numbers **discontinued**. |

So Twilio's Indian numbers are effectively inbound-only, and outbound-to-India must carry a foreign caller ID — which for an Indian SDR use case is exactly the wrong thing (low answer rates, and it reads as a spam call).

### What an India-registered provider requires instead

From Plivo's India documentation (Exotel, Ozonetel, Knowlarity, Kaleyra impose materially the same):

- **Only businesses registered in India** may rent Indian numbers, make domestic calls, or use domestic routes.
- **Media anchoring: both call legs must originate and terminate within India**, or the call is rejected. → *Our media WebSocket would have to be hosted in India (Azure Central India), not wherever the App Service currently sits.* This is a real infrastructure consequence, not paperwork.
- **Number series is use-case-locked:** 140 = promotional only; landline series (022/080/…) = service & transactional only, promotional strictly prohibited; 160 = BFSI service/transactional.
- **"Cold calling is prohibited in India."** Explicit prior digital consent is required; without it the call is Unsolicited Commercial Communication (UCC), exposing you to blocking and termination. DND/NCPR scrubbing and TRAI calling-hour limits apply on top.

### What this means for the product

An AI agent **cold-calling** Indian consumers is not a compliance detail to tidy up later — it is not a lawful use case, on any vendor. What *is* buildable:

- Calling **existing customers or explicitly opted-in contacts**, from an Indian entity, via an Indian carrier, on the correct number series, inside TRAI hours, with DND scrubbing and consent records.
- INNOIRA appears to be an Indian entity, so the entity requirement is likely already satisfied — which makes the Indian-provider path viable where Twilio's is not.

**Recommendation:** treat India as a **second telephony provider**, not a number-purchase feature. That means abstracting `twilio_client.py` behind a telephony interface (the module docstring already anticipates this) and adding an Indian carrier alongside it — plus consent capture in the lead model and India-aware campaign guardrails. That is a materially bigger project than the Fish work and should be scoped separately. Get Indian telecom counsel before building; the vendor pages above all disclaim legal advice, and these rules move.

---

## 6. In-product number purchasing (US/UK/CA/etc.)

Genuinely missing today and worth building — for countries without India's restrictions.

**Flow:** `AvailablePhoneNumbers/{Country}/{Local|TollFree|Mobile}` (search, filter by area code + voice capability) → `IncomingPhoneNumbers` (purchase) → set `VoiceUrl` to our webhook → store in `voice_numbers` with its subaccount SID.

**Architecture — one Twilio subaccount per workspace.** This is Twilio's own recommendation for resellers: it isolates each tenant's numbers and addresses, gives per-customer usage for invoicing, and lets you suspend a delinquent workspace without touching anyone else.

**Also required:**
- Many countries need an **Address SID** and/or a **regulatory Bundle SID** at purchase time — that's a document-upload and approval flow in your UI, not a single API call.
- Meter number rental + per-minute usage into the existing `credit_ledger` / `billing.py`, same as `_settle_call_billing` already does for calls.

**Fix while you're in there:** `POST /numbers/import` accepts any string with **zero verification** that the workspace controls it. It doesn't enable spoofing (Twilio rejects a `From` you don't own), but it produces confusing downstream call failures with no clear cause. Validate against the account's owned numbers at import.

---

## 7. Recommended sequence

1. **Now, ~1 line:** move `google_voice` off `en-US-Studio-Q`. 10× TTS saving, zero risk.
2. **~2–4 days:** `twilio_fish` provider (PCM 8 kHz → μ-law), plus the marker-stripping guardrail.
3. **~0.5 day + policy:** voice cloning, workspace-owned voices only, with upload attestation.
4. **~1–2 weeks:** number purchasing with per-workspace subaccounts — non-India first.
5. **Separate project, counsel first:** India as a second telephony provider, with consent capture and India-aware campaign guardrails.

Steps 1–4 are ordinary engineering. Step 5 is a business/regulatory decision that happens to have code attached.

---

## Sources

- [Fish Audio — Text to Speech docs](https://docs.fish.audio/features/text-to-speech)
- [Fish Audio — TTS API reference](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)
- [Fish Audio — Emotion control](https://docs.fish.audio/developer-guide/core-features/emotions)
- [Fish Audio pricing analysis](https://texttolab.com/blog/fish-audio-pricing)
- [Google Cloud TTS pricing breakdown](https://texttolab.com/blog/google-cloud-tts-pricing)
- [OpenAI Realtime API pricing, measured](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions)
- [Twilio — India voice guidelines](https://www.twilio.com/en-us/guidelines/in/voice)
- [Twilio — India regulatory guidelines](https://www.twilio.com/en-us/guidelines/in/regulatory)
- [Twilio — AvailablePhoneNumber resource](https://www.twilio.com/docs/phone-numbers/api/availablephonenumber-resource)
- [Twilio — guide to subaccounts](https://www.twilio.com/en-us/blog/guide-twilio-subaccounts)
- [Plivo — India calling regulations](https://www.plivo.com/docs/voice/concepts/india-calling)
- [Product notice — domestic outbound from Indian numbers, eff. 2024-08-01](https://support.talkdesk.com/hc/en-us/articles/27625422599067--Archive-Product-Notice-Changes-to-Domestic-Outbound-Calls-from-Indian-Numbers-Effective-Aug-1-2024)

---

© INNOIRA Consulting Services 2026 · CONFIDENTIAL
