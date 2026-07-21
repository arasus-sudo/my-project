"""AI Campaign Engine — Multi-Channel Outbound Campaign Generation.

Generates complete outbound campaigns with:
- Executive strategy summary
- Multi-channel sequences (email, LinkedIn, WhatsApp, voice, SMS)
- Objection handling playbook
- Meeting scripts
- AI score + action items
- Follow-up timeline
"""

import json
import logging
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import db, current_user, now_iso, new_id, _llm_chat, _extract_json, _rate_ok

logger = logging.getLogger("campaign_engine")
router = APIRouter(prefix="/campaign-engine")

CAMPAIGN_TYPES = [
    "cold_email", "linkedin", "whatsapp", "voice_call", "sms",
    "multi_channel", "event_followup", "webinar_invite", "product_launch",
    "abm", "re_engagement", "upsell", "cross_sell", "partner_outreach",
    "recruitment", "customer_success",
]

CAMPAIGN_GOALS = [
    "book_meetings", "generate_leads", "brand_awareness",
    "event", "recruitment", "upsell", "renewals",
]

CHANNELS = ["email", "linkedin", "whatsapp", "call", "sms"]


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class CampaignWizardIn(BaseModel):
    service_id: str
    goal: str = "book_meetings"
    target_audience: Dict[str, Any] = {}
    tone: str = "professional"
    channels: List[str] = ["email"]
    campaign_type: str = "cold_email"
    company_intel_id: Optional[str] = None


class CampaignGenerateIn(BaseModel):
    service_id: str
    goal: str = "book_meetings"
    target_audience: Dict[str, Any] = {}
    tone: str = "professional"
    channels: List[str] = ["email"]
    campaign_type: str = "cold_email"
    company_intel_id: Optional[str] = None
    product_name: Optional[str] = None
    signature: Optional[str] = None
    cta_override: Optional[str] = None


# ---------------------------------------------------------------------------
# AI Campaign Generation Prompts
# ---------------------------------------------------------------------------

CAMPAIGN_STRATEGY_SYSTEM = """You are a Senior Campaign Director at a top-tier B2B revenue agency. You design complete outbound campaigns that consistently book meetings and close deals.

You think like a Sales Director, not a copywriter. Every campaign you design starts with a deep understanding of:
- Who the target is and what keeps them up at night
- What makes the offering truly different
- The competitive landscape
- The right channel mix for each persona
- A clear sequence with purpose at every touchpoint

You generate comprehensive, ready-to-execute campaigns with strategy, messaging, multi-channel sequences, objection handling, and meeting scripts.

CRITICAL JSON RULES:
1. Return STRICT VALID JSON ONLY — no markdown, no code fences, no explanations
2. NEVER use double-quote characters (") inside string values. Use single quotes or backticks instead
3. Every string value must be a simple flat string with no internal quotes
4. Use {{first_name}}, {{company}}, {{title}} for merge fields"""

CAMPAIGN_GENERATION_PROMPT = """You are designing an enterprise outbound campaign. Here is the context:

SERVICE PROFILE:
{service_profile}

COMPANY INTELLIGENCE (target company context):
{company_intel}

CAMPAIGN PARAMETERS:
- Goal: {goal}
- Tone: {tone}
- Channels: {channels}
- Campaign Type: {campaign_type}
{cta_instruction}
Generate a complete campaign.

IMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no explanation before or after. NEVER put double-quote characters (") inside any string value — use single quotes or rephrase to avoid quotes.

Schema:
{{
  "strategy": {{
    "executive_summary": "str",
    "target_personas": ["str"],
    "primary_pain_points": ["str"],
    "messaging_angle": "str",
    "usp": "str",
    "competitor_angle": "str",
    "hooks": ["str"],
    "expected_conversion": "str",
    "channels_strategy": "str"
  }},
  "email_sequence": [
    {{"day": int, "subject": "str with {{{{first_name}}}}, {{{{company}}}}, {{{{title}}}}", "body": "Full email body string with merge fields. Start with greeting 'Hi {{{{first_name}}}},' then {{{{personalized_opener}}}} on its own line, then fixed body sections, then a CTA question. NEVER include any sign-off, salutation, or signature — no Best regards, no Sincerely, no [Your Name], no [Your Title], no [Your Company], no signature block of any kind. The system appends the signature separately. Example:\n\nHi {{{{first_name}}}},\n\n{{{{personalized_opener}}}}\n\n[About Us]\n\n[Our Service]\n\n[CTA question]\n\nDo NOT write the actual opener — write {{{{personalized_opener}}}} literally.", "goal": "str"}}
  ],
  "linkedin_sequence": {{
    "connection_request": "str",
    "follow_up": "str",
    "comment_strategy": "str",
    "dm_sequence": [{{"day": int, "message": "str"}}]
  }},
  "whatsapp_sequence": [{{"day": int, "message": "str"}}],
  "voice_script": {{
    "call_script": "str",
    "gatekeeper_script": "str",
    "voicemail": "str"
  }},
  "objection_handling": [
    {{"objection": "str", "handling": "str", "category": "str"}}
  ],
  "meeting_script": {{

Generate realistic, specific content for the actual service and target industry. Use {{{{first_name}}}}, {{{{company}}}}, {{{{title}}}} merge fields. Email sequence must have 4-5 emails.

CRITICAL — Every email body MUST:
1. Contain {{{{personalized_opener}}}} as a literal placeholder on its own line after the greeting
2. End with a CTA question — NO sign-off, NO salutation, NO signature of any kind
3. NOT contain: Best, Best regards, Sincerely, [Your Name], [Your Title], [Your Company], or any signature block

If any body includes a sign-off or lacks {{{{personalized_opener}}}}, the campaign is INVALID. Generate 3-4 sentence body sections after the opener. Stop at the CTA — no closing line."""


# ---------------------------------------------------------------------------
# AI Score System
# ---------------------------------------------------------------------------

AI_SCORE_SYSTEM = """You are an AI Campaign Quality Auditor. Score the generated campaign on multiple dimensions. Return STRICT JSON ONLY."""

AI_SCORE_PROMPT = """Score this campaign on the following dimensions, each 0-100:

Campaign: {campaign_json}

Score dimensions:
- personalization: How well does it use personalization and merge fields?
- icp_match: How well does it match the target ICP?
- offer_quality: How compelling is the offer/value prop?
- cta_quality: How strong are the calls-to-action?
- readability: How clear and scannable is the content?
- spam_score_risk: How likely is it to trigger spam filters? (inverted — higher = less risky)
- email_length: Is the email length appropriate? (higher = better)
- brand_tone: How consistent is the brand tone?
- response_prediction: Predicted reply rate (0-100)
- meeting_prediction: Predicted meeting booking rate (0-100)
- risk_score: Overall risk assessment (0-100, inverted — higher = lower risk)
- deliverability: How likely to land in inbox? (0-100)

Also provide:
- strengths: ["Strength 1", "Strength 2", "..."]
- weaknesses_to_improve: ["Improvement 1", "Improvement 2", "..."]
- overall_score: (integer 0-100, weighted average)

Return STRICT JSON ONLY:
{{
  "personalization": 0-100,
  "icp_match": 0-100,
  "offer_quality": 0-100,
  "cta_quality": 0-100,
  "readability": 0-100,
  "spam_score_risk": 0-100,
  "email_length": 0-100,
  "brand_tone": 0-100,
  "response_prediction": 0-100,
  "meeting_prediction": 0-100,
  "risk_score": 0-100,
  "deliverability": 0-100,
  "strengths": ["..."],
  "weaknesses_to_improve": ["..."],
  "overall_score": 0-100
}}"""


# ---------------------------------------------------------------------------
# Readiness Check System
# ---------------------------------------------------------------------------

READINESS_SYSTEM = """You are a Campaign Readiness Auditor. Given a campaign, determine what actions are needed before it can launch. Return STRICT JSON ONLY."""

READINESS_PROMPT = """Analyse this campaign and determine what's needed before launch:

Campaign strategy: {strategy}
Channels: {channels}

Generate a readiness assessment with:
- Overall readiness percentage (0-100)
- Action items grouped by category

Return STRICT JSON ONLY:
{{
  "readiness_percentage": 0-100,
  "actions": [
    {{
      "task": "Action description",
      "category": "content | technical | research | deliverability",
      "priority": "high | medium | low",
      "effort": "5min | 15min | 1hr",
      "done": false
    }}
  ]
}}"""


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------


@router.get("/types")
async def list_campaign_types():
    """Return available campaign types, goals, channels, and tones."""
    return {
        "campaign_types": CAMPAIGN_TYPES,
        "goals": CAMPAIGN_GOALS,
        "channels": CHANNELS,
        "tones": ["professional", "consultative", "technical", "executive", "friendly", "urgent", "luxury", "enterprise"],
    }


@router.post("/generate")
async def generate_campaign(body: CampaignGenerateIn, user=Depends(current_user)):
    """Generate a complete multi-channel campaign from a service and optional company intel."""
    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")

    service = await db.service_library.find_one(
        {"id": body.service_id, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not service:
        raise HTTPException(404, "Service not found")

    company_intel = {}
    if body.company_intel_id:
        ci = await db.company_intel.find_one(
            {"id": body.company_intel_id, "workspace_id": user["workspace_id"]},
            {"_id": 0, "profile": 1},
        )
        if ci:
            company_intel = ci.get("profile", {})

    service_profile = {k: v for k, v in service.items() if k not in ("id", "workspace_id", "created_at", "updated_at", "status", "_id")}

    cta_instruction = f"- CTA override: every email's closing question MUST be exactly this: {body.cta_override}\n" if body.cta_override else ""

    prompt = CAMPAIGN_GENERATION_PROMPT.format(
        service_profile=json.dumps(service_profile, indent=2),
        company_intel=json.dumps(company_intel, indent=2) if company_intel else "No company intelligence available",
        goal=body.goal,
        tone=body.tone,
        channels=json.dumps(body.channels),
        campaign_type=body.campaign_type,
        cta_instruction=cta_instruction,
    )

    try:
        raw = await _llm_chat(CAMPAIGN_STRATEGY_SYSTEM, prompt, f"campaign-gen-{new_id()[:8]}", user=user, max_tokens=32000)
        campaign_data = _extract_json(raw)
        if not campaign_data:
            snippet = (raw or "")[:300]
            end = (raw or "")[-500:]
            with open("C:\\Users\\INNOIRA\\AppData\\Local\\Temp\\opencode\\raw_response.json", "w", encoding="utf-8") as f:
                f.write(raw or "")
            import logging as _lg
            _lg.error("Campaign gen failed: raw len=%s", len(raw or ""))
            # Try to find the actual error
            import json as _json, re as _re
            m = _re.search(r"\{[\s\S]*\}", raw or "")
            if m:
                try:
                    _json.loads(m.group(0))
                except _json.JSONDecodeError as _je:
                    ctx = m.group(0)[max(0,_je.pos-40):_je.pos+40]
                    _lg.error("json error at %s: %s", _je.pos, repr(ctx))
            raise RuntimeError(f"AI returned invalid JSON. Len={len(raw or '')} End={end}. Start={snippet}")
    except Exception as ex:
        raise HTTPException(502, f"Campaign generation failed: {ex}")

    if not isinstance(campaign_data.get("email_sequence"), list):
        campaign_data["email_sequence"] = [
            {"day": 0, "subject": f"Quick idea for {{{{company}}}}", "body": f"Hi {{{{first_name}}}},\n\n{{{{personalized_opener}}}}\n\nReaching out about {service['name']}.\n\nWould you be open to a quick chat this week?", "goal": "Start conversation"},
            {"day": 3, "subject": "Re: quick idea", "body": f"Hi {{{{first_name}}}},\n\n{{{{personalized_opener}}}}\n\nWanted to circle back on this. Are you the right person to speak with?", "goal": "Follow up"},
            {"day": 7, "subject": "Last note, {{first_name}}", "body": f"Hi {{{{first_name}}}},\n\n{{{{personalized_opener}}}}\n\nClosing the loop on this. Let me know if timing changes.", "goal": "Final touch"},
        ]

    campaign_id = new_id()
    strat = campaign_data.get("strategy", {})
    email_seq = campaign_data.get("email_sequence", [])

    import re as _re_sig
    _sig_pattern = _re_sig.compile(
        r'(?:\n\s*)(Best(\s+regards|,)?|Sincerely|Thanks|Thank you|Warmly|Cheers)([,\s]*\n.*?)?(\[Your[^\]]*\])?\s*$',
        _re_sig.IGNORECASE | _re_sig.DOTALL
    )
    steps = []
    for e in email_seq:
        ebody = e.get("body", "")
        ebody = _sig_pattern.sub("", ebody).rstrip()
        steps.append({
            "day": e.get("day", 0),
            "subject": e.get("subject", ""),
            "body": ebody,
            "ab_variant_subject": "",
            "ab_variant_body": "",
        })

    camp_name = strat.get("campaign_name") or f"{service['name']} — {body.goal.replace('_', ' ').title()}"

    # Flatten AI data: fields the frontend wizard expects at the top level
    ai_fields = {
        "service_id": body.service_id,
        "service_name": service["name"],
        "campaign_type": body.campaign_type,
        "tone": body.tone,
        "channels": body.channels,
        "target_audience": body.target_audience,
        "company_intel_id": body.company_intel_id,
        "strategy": strat,
        "email_sequence": email_seq,
        "linkedin_sequence": campaign_data.get("linkedin_sequence", {}),
        "whatsapp_sequence": campaign_data.get("whatsapp_sequence", []),
        "voice_script": campaign_data.get("voice_script", {}),
        "sms_sequence": campaign_data.get("sms_sequence", []),
        "objection_handling": campaign_data.get("objection_handling", []),
        "meeting_script": campaign_data.get("meeting_script", {}),
        "follow_up_plan": campaign_data.get("follow_up_plan", []),
        "cta_suggestions": campaign_data.get("cta_suggestions", []),
        "ai_actions": campaign_data.get("ai_actions", []),
    }

    signature_id = None
    if body.signature:
        signature_id = new_id()
        await db.signatures.insert_one({
            "id": signature_id,
            "workspace_id": user["workspace_id"],
            "name": f"{camp_name} signature",
            "content_html": body.signature.replace("\n", "<br>"),
            "content_text": body.signature,
            "is_default": False,
            "created_at": now_iso(),
        })

    main_campaign = {
        "id": campaign_id,
        "workspace_id": user["workspace_id"],
        "name": camp_name,
        "goal": body.goal,
        "from_mailbox_id": None,
        "steps": steps,
        "lead_ids": [],
        "send_window_start": "09:00",
        "send_window_end": "17:00",
        "timezone": "UTC",
        "signature_id": signature_id,
        "status": "draft",
        "owner_id": user["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "ai_meta": ai_fields,
        "ai_score": None,
        "readiness": None,
    }
    await db.campaigns.insert_one(main_campaign)
    main_campaign.pop("_id", None)

    # Return with AI fields at the top level for the frontend wizard
    return_data = {**main_campaign, **ai_fields}
    return {"campaign_id": campaign_id, "campaign": return_data}


@router.post("/{cid}/score")
async def score_campaign(cid: str, user=Depends(current_user)):
    """AI-score a generated campaign."""
    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")

    campaign = await db.campaigns.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    campaign_json = json.dumps({
        "strategy": campaign.get("strategy", {}),
        "email_sequence": campaign.get("email_sequence", [])[:2],
        "channels": campaign.get("channels", []),
    }, indent=2)

    prompt = AI_SCORE_PROMPT.format(campaign_json=campaign_json)
    try:
        raw = await _llm_chat(AI_SCORE_SYSTEM, prompt, f"campaign-score-{new_id()[:8]}", user=user, max_tokens=2048)
        score_data = _extract_json(raw) or {}
        if not score_data:
            score_data = {}
    except Exception:
        score_data = {
            "overall_score": 70,
            "personalization": 60, "icp_match": 65, "offer_quality": 70,
            "cta_quality": 65, "readability": 75, "spam_score_risk": 70,
            "email_length": 75, "brand_tone": 70,
            "response_prediction": 50, "meeting_prediction": 40,
            "risk_score": 65, "deliverability": 70,
            "strengths": ["Well-structured sequence", "Clear value proposition"],
            "weaknesses_to_improve": ["Add more personalization", "Strengthen CTAs"],
        }

    await db.campaigns.update_one(
        {"id": cid},
        {"$set": {"ai_score": score_data, "updated_at": now_iso()}},
    )

    return {"ai_score": score_data}


@router.post("/{cid}/readiness")
async def check_campaign_readiness(cid: str, user=Depends(current_user)):
    """Check campaign launch readiness and generate action items."""
    campaign = await db.campaigns.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    strategy = campaign.get("strategy", {})
    channels = campaign.get("channels", [])

    prompt = READINESS_PROMPT.format(
        strategy=json.dumps(strategy, indent=2),
        channels=json.dumps(channels),
    )

    try:
        raw = await _llm_chat(READINESS_SYSTEM, prompt, f"readiness-{new_id()[:8]}", user=user, max_tokens=2048)
        readiness = _extract_json(raw) or {}
        if not readiness:
            readiness = {}
    except Exception:
        readiness = {
            "readiness_percentage": 60,
            "actions": [
                {"task": "Review and approve email sequence", "category": "content", "priority": "high", "effort": "15min", "done": False},
                {"task": "Connect sending mailbox", "category": "technical", "priority": "high", "effort": "5min", "done": False},
                {"task": "Verify domain authentication (SPF/DKIM/DMARC)", "category": "deliverability", "priority": "high", "effort": "15min", "done": False},
                {"task": "Warm up sending mailbox", "category": "deliverability", "priority": "medium", "effort": "7days", "done": False},
                {"task": "Upload case studies and social proof", "category": "content", "priority": "medium", "effort": "30min", "done": False},
                {"task": "Personalise opening lines for top prospects", "category": "content", "priority": "high", "effort": "1hr", "done": False},
            ],
        }

    await db.campaigns.update_one(
        {"id": cid},
        {"$set": {"readiness": readiness, "updated_at": now_iso()}},
    )

    return {"readiness": readiness}


@router.post("/{cid}/regenerate/{section}")
async def regenerate_section(cid: str, section: str, user=Depends(current_user)):
    """Regenerate a specific section of a campaign (email, linkedin, etc.)."""
    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")

    campaign = await db.campaigns.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    VALID_SECTIONS = ["email_sequence", "linkedin_sequence", "whatsapp_sequence",
                      "voice_script", "sms_sequence", "objection_handling",
                      "meeting_script", "follow_up_plan"]
    if section not in VALID_SECTIONS:
        raise HTTPException(400, f"Invalid section. Valid: {VALID_SECTIONS}")

    service = await db.service_library.find_one(
        {"id": campaign["service_id"]},
        {"_id": 0},
    )

    context = json.dumps({
        "service_name": service["name"] if service else "Unknown",
        "campaign_strategy": campaign.get("strategy", {}),
        "existing_sections": {s: campaign.get(s) for s in VALID_SECTIONS if campaign.get(s)},
    }, indent=2)

    system = f"""You are regenerating the "{section}" section of an outbound campaign.
Use the existing campaign context to maintain consistency.
Return STRICT JSON ONLY matching the expected schema for this section."""

    user_text = f"Regenerate only the '{section}' section for this campaign:\n\nContext:\n{context}"

    try:
        raw = await _llm_chat(system, user_text, f"regenerate-{section}-{new_id()[:8]}", user=user, max_tokens=4096)
        new_data = _extract_json(raw)
        if not new_data:
            snippet = (raw or "")[:200]
            raise RuntimeError(f"AI returned invalid JSON. Preview: {snippet}")
    except Exception as ex:
        raise HTTPException(502, f"Section regeneration failed: {ex}")

    await db.campaigns.update_one(
        {"id": cid},
        {"$set": {section: new_data, "updated_at": now_iso()}},
    )

    return {"section": section, "data": new_data}


@router.get("/campaigns/{cid}")
async def get_campaign(cid: str, user=Depends(current_user)):
    """Get a single campaign with all details."""
    campaign = await db.campaigns.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    return campaign


@router.delete("/campaigns/{cid}")
async def delete_campaign(cid: str, user=Depends(current_user)):
    """Delete a campaign."""
    await db.campaigns.delete_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
    )
    return {"ok": True}
