"""The send queue — multi-channel outbound (email, voice, SMS, WhatsApp, LinkedIn).

Enqueues campaign steps by channel, dispatches in run_send_tick to the
appropriate sender. Workers live here; API key management is delegated to
twilio_client / linkedin_client / mailbox_client.
"""

import logging
import re
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from server import db, now_iso, new_id, _log_activity, _quarantine_lead, _verify_email_syntax
import mailbox_client

log = logging.getLogger(__name__)

MAX_PER_TICK = 25
RETRY_BACKOFF_MIN = 15

CHANNEL_ICONS = {
    "email": "✉", "phone_call": "📞", "sms": "💬", "whatsapp": "📱",
    "linkedin_connect": "🔗", "linkedin_message": "💌", "linkedin_comment": "🗨",
}


def _apply_opener(text: str, opener: str) -> str:
    if not text or "{{personalized_opener}}" not in text:
        return text or ""
    if opener:
        result = text.replace("{{personalized_opener}}", opener.strip())
        return re.sub(r"\n{3,}", "\n\n", result)
    return "\n".join(l for l in text.split("\n") if "{{personalized_opener}}" not in l).strip()


# ----------------------------- Enqueue -----------------------------------------
async def enqueue_campaign(workspace_id: str, campaign: Dict[str, Any]) -> Dict[str, Any]:
    steps = campaign.get("steps") or []
    if not steps:
        raise ValueError("This campaign has no steps.")

    lead_ids = campaign.get("lead_ids") or []
    if not lead_ids:
        raise ValueError("Select at least one lead.")

    has_email = any(s.get("channel", "email") == "email" for s in steps)
    if has_email:
        mailboxes = await db.mailboxes.find(
            {"workspace_id": workspace_id, "status": "connected"}, {"_id": 0}).to_list(20)
        if not mailboxes:
            raise ValueError("Connect a mailbox before launching — email steps require one.")
    else:
        mailboxes = []

    suppressed = {s["email"].lower() async for s in db.suppressions.find(
        {"workspace_id": workspace_id}, {"_id": 0, "email": 1})}

    tz = ZoneInfo(campaign.get("timezone") or "UTC")
    now_local = datetime.now(tz)

    # Resolve signature (email only)
    signature_html = ""
    signature_text = ""
    sig_id = campaign.get("signature_id")
    if sig_id:
        sig = await db.signatures.find_one({"id": sig_id, "workspace_id": workspace_id}, {"_id": 0})
        if sig:
            signature_html = sig.get("content_html", "")
            signature_text = sig.get("content_text", "")

    # Build personalized email lookup (lead_id -> email data, only approved)
    personalized_map = {}
    for p in campaign.get("personalized_emails", []):
        if p.get("status") == "approved":
            personalized_map[p["lead_id"]] = p

    queued, skipped = 0, 0
    for lid in lead_ids:
        lead = await db.leads.find_one({"id": lid, "workspace_id": workspace_id}, {"_id": 0})
        if not lead:
            skipped += 1
            continue

        email = (lead.get("email") or "").lower()
        if email and not _verify_email_syntax(email):
            await _quarantine_lead(workspace_id, lead, "invalid_syntax")
            skipped += 1
            continue
        if email and email in suppressed:
            await _quarantine_lead(workspace_id, lead, "on_suppression_list")
            skipped += 1
            continue
        if lead.get("dnc"):
            await _quarantine_lead(workspace_id, lead, "do_not_contact")
            skipped += 1
            continue

        personal = personalized_map.get(lid)

        for step_idx, step in enumerate(steps):
            channel = step.get("channel", "email")

            # For email: skip if no approved personalization
            if channel == "email" and not personal:
                continue

            send_at = _next_window_slot(
                now_local + timedelta(days=int(step.get("day") or 0)),
                campaign.get("send_window_start", "09:00"),
                campaign.get("send_window_end", "17:00"),
                tz,
            )

            queue_item = {
                "id": new_id(), "workspace_id": workspace_id,
                "campaign_id": campaign["id"], "lead_id": lid, "step": step_idx,
                "channel": channel,
                "status": "pending",
                "send_at": send_at.isoformat(),
                "attempts": 0, "error": None,
                "created_at": now_iso(),
            }

            if channel == "email":
                if step_idx == 0:
                    subject = personal.get("subject", step.get("subject", ""))
                    body_html = personal.get("body_html", step.get("body_html") or step.get("body", ""))
                    body_text = personal.get("body", step.get("body_text") or step.get("body", ""))
                else:
                    opener = personal.get("personalized_opener", "")
                    subject = _apply_opener(step.get("subject", ""), opener)
                    body_html = _apply_opener(step.get("body_html") or step.get("body", ""), opener)
                    body_text = _apply_opener(step.get("body_text") or step.get("body", ""), opener)
                if signature_html and body_html:
                    body_html = body_html + "<br><br>" + signature_html
                if signature_text and body_text:
                    body_text = body_text + "\n\n" + signature_text
                queue_item["subject"] = subject
                queue_item["body_html"] = body_html
                queue_item["body_text"] = body_text

            elif channel in ("sms", "whatsapp"):
                body = step.get("body", "") or step.get("body_text", "") or step.get("body_html", "")
                queue_item["body"] = body

            elif channel == "phone_call":
                queue_item["script"] = step.get("script", "")
                queue_item["agent_id"] = step.get("agent_id")
                queue_item["call_timeout_seconds"] = step.get("call_timeout_seconds", 60)

            elif channel == "linkedin_message":
                queue_item["message"] = step.get("linkedin_message", "") or step.get("body", "")
                queue_item["linkedin_url"] = lead.get("linkedin_url", "")

            elif channel == "linkedin_comment":
                queue_item["comment_text"] = step.get("linkedin_comment_text", "") or step.get("body", "")
                queue_item["post_url"] = step.get("linkedin_post_url", "")

            elif channel == "linkedin_connect":
                queue_item["connection_note"] = step.get("linkedin_connection_note", "") or step.get("body", "")
                queue_item["linkedin_url"] = lead.get("linkedin_url", "")
                # Mark as manual — connection requests require human action
                queue_item["status"] = "manual"

            await db.send_queue.insert_one(queue_item)
            queued += 1

    return {"queued": queued, "skipped": skipped, "mailboxes": len(mailboxes)}


# ----------------------------- Tick: drain queue --------------------------------
async def run_send_tick(base_url: str = "") -> int:
    now = datetime.now(dt_timezone.utc)

    due = await db.send_queue.find({
        "status": "pending",
        "send_at": {"$lte": now.isoformat()},
    }, {"_id": 0}).sort("send_at", 1).to_list(MAX_PER_TICK * 4)

    log.info("run_send_tick: found %s pending items", len(due))
    sent = 0
    for row in due:
        if sent >= MAX_PER_TICK:
            break

        campaign = await db.campaigns.find_one(
            {"id": row["campaign_id"], "workspace_id": row["workspace_id"]}, {"_id": 0})
        if not campaign or campaign.get("status") != "active":
            await db.send_queue.update_one({"id": row["id"]}, {"$set": {"status": "cancelled"}})
            log.info("run_send_tick: cancelled queue %s — campaign not active", row["id"])
            continue

        replied = await db.events.count_documents({
            "workspace_id": row["workspace_id"], "lead_id": row["lead_id"], "type": "replied"})
        if replied:
            await db.send_queue.update_one({"id": row["id"]},
                                           {"$set": {"status": "cancelled", "error": "lead replied"}})
            log.info("run_send_tick: cancelled queue %s — lead replied", row["id"])
            continue

        channel = row.get("channel", "email")

        # Claim it.
        claimed = await db.send_queue.find_one_and_update(
            {"id": row["id"], "status": "pending"},
            {"$set": {"status": "sending", "attempts": row.get("attempts", 0) + 1}},
        )
        if not claimed:
            continue

        lead = await db.leads.find_one({"id": row["lead_id"]}, {"_id": 0})
        if not lead:
            await db.send_queue.update_one({"id": row["id"]}, {"$set": {"status": "cancelled"}})
            continue

        try:
            if channel == "email":
                await _send_email(row, lead, base_url, campaign)
            elif channel == "sms":
                await _send_sms(row, lead)
            elif channel == "whatsapp":
                await _send_whatsapp(row, lead)
            elif channel == "phone_call":
                await _send_phone_call(row, lead)
            elif channel == "linkedin_message":
                await _send_linkedin_message(row, lead)
            elif channel == "linkedin_comment":
                await _send_linkedin_comment(row, lead)
            else:
                log.warning("run_send_tick: unknown channel %s for %s", channel, row["id"])
                await db.send_queue.update_one({"id": row["id"]}, {"$set": {"status": "failed", "error": f"unknown channel: {channel}"}})
                continue
        except Exception as ex:
            attempts = row.get("attempts", 0) + 1
            failed = attempts >= 3
            await db.send_queue.update_one({"id": row["id"]}, {"$set": {
                "status": "failed" if failed else "pending",
                "error": str(ex)[:300],
                "send_at": (now + timedelta(minutes=RETRY_BACKOFF_MIN)).isoformat(),
            }})
            log.warning("send failed (attempt %s, channel %s): %s", attempts, channel, ex)
            continue

        await db.events.insert_one({
            "id": new_id(), "workspace_id": row["workspace_id"],
            "campaign_id": row["campaign_id"], "lead_id": row["lead_id"],
            "step": row["step"], "type": "sent", "at": now_iso(),
            "channel": channel,
        })
        sent += 1

    log.info("run_send_tick: sent %s item(s)", sent)
    return sent


# ----------------------------- Email sender ------------------------------------
async def _send_email(row: Dict[str, Any], lead: Dict[str, Any], base_url: str,
                      campaign: Dict[str, Any]):
    from server import inject_tracking

    mailbox = await _pick_mailbox(row["workspace_id"])
    if not mailbox:
        raise RuntimeError("no eligible mailbox")

    subject, html, text = _render(row, lead)
    if base_url:
        html = inject_tracking(html, row["workspace_id"], row["id"], base_url)

    result = await mailbox_client.send(
        mailbox, to_addr=lead["email"], subject=subject, html=html, text=text,
        reply_to=mailbox.get("email"),
    )

    await db.send_queue.update_one({"id": row["id"]}, {"$set": {
        "status": "sent", "sent_at": now_iso(), "error": None,
        "provider_message_id": result.get("provider_message_id"),
        "thread_id": result.get("thread_id"),
        "mailbox_id": mailbox["id"], "mocked": result.get("mocked", True),
    }})
    await _mark_sent(mailbox)

    await db.generated_emails.insert_one({
        "id": new_id(), "workspace_id": row["workspace_id"],
        "campaign_id": row["campaign_id"], "lead_id": row["lead_id"],
        "step": row["step"], "subject": row.get("subject", ""),
        "body_html": row.get("body_html", ""),
        "body_text": row.get("body_text", ""),
        "status": "sent", "source": "campaign_send",
        "generated_at": row.get("created_at", now_iso()),
        "sent_at": now_iso(),
        "mailbox_email": mailbox.get("email", ""),
        "campaign_name": (campaign or {}).get("name", ""),
        "lead_email": lead.get("email", ""),
        "lead_name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
    })

    await _log_activity(row["workspace_id"], row["lead_id"], "pitch", "email_sent",
                         f"Sent “{subject}” from {mailbox['email']}",
                         {"campaign_id": row["campaign_id"], "step": row["step"]})


# ----------------------------- SMS sender --------------------------------------
async def _send_sms(row: Dict[str, Any], lead: Dict[str, Any]):
    from twilio_client import twilio_client

    phone = lead.get("phone")
    if not phone:
        raise ValueError("lead has no phone number")

    body = _merge_fields(row.get("body", ""), lead)

    result = await twilio_client.send_sms(to_number=phone, body=body)
    await db.send_queue.update_one({"id": row["id"]}, {"$set": {
        "status": "sent", "sent_at": now_iso(), "error": None,
        "provider_message_id": result.get("message_id"),
        "mocked": result.get("mocked", True),
    }})


# ----------------------------- WhatsApp sender ----------------------------------
async def _send_whatsapp(row: Dict[str, Any], lead: Dict[str, Any]):
    from twilio_client import twilio_client

    phone = lead.get("phone")
    if not phone:
        raise ValueError("lead has no phone number")

    body = _merge_fields(row.get("body", ""), lead)

    result = await twilio_client.send_whatsapp(to_number=phone, body=body)
    await db.send_queue.update_one({"id": row["id"]}, {"$set": {
        "status": "sent", "sent_at": now_iso(), "error": None,
        "provider_message_id": result.get("message_id"),
        "mocked": result.get("mocked", True),
    }})


# ----------------------------- Phone call sender --------------------------------
async def _send_phone_call(row: Dict[str, Any], lead: Dict[str, Any]):
    from twilio_client import twilio_client
    from voice_eq import _agent_twiml_url

    phone = lead.get("phone")
    if not phone:
        raise ValueError("lead has no phone number")

    agent_id = row.get("agent_id")
    script = _merge_fields(row.get("script", ""), lead)

    # Find an active voice agent or use default
    agent = None
    if agent_id:
        agent = await db.voice_agents.find_one({"id": agent_id, "workspace_id": row["workspace_id"]}, {"_id": 0})

    twiml_url = _agent_twiml_url(agent, script) if agent else ""
    from_number = None  # Twilio will use default

    result = await twilio_client.create_phone_call(
        from_number=from_number or "+15005550006",
        to_number=phone,
        twiml_url=twiml_url or f"https://handler.twilio.com/twiml/say?text={script}",
    )
    await db.send_queue.update_one({"id": row["id"]}, {"$set": {
        "status": "sent", "sent_at": now_iso(), "error": None,
        "provider_message_id": result.get("call_id"),
        "mocked": result.get("mocked", True),
    }})


# ----------------------------- LinkedIn senders ---------------------------------
async def _send_linkedin_message(row: Dict[str, Any], lead: Dict[str, Any]):
    import linkedin_client

    linkedin_url = lead.get("linkedin_url") or row.get("linkedin_url", "")
    if not linkedin_url:
        raise ValueError("lead has no LinkedIn URL")

    integration = await db.integrations.find_one(
        {"workspace_id": row["workspace_id"], "provider": "linkedin", "status": "connected"},
        {"_id": 0})
    if not integration:
        raise RuntimeError("no connected LinkedIn account")

    message = _merge_fields(row.get("message", ""), lead)
    # LinkedIn Messaging API is limited — store as message to be sent manually
    await db.send_queue.update_one({"id": row["id"]}, {"$set": {
        "status": "manual", "sent_at": now_iso(),
        "error": "LinkedIn messages require manual sending via LinkedIn.com",
        "note": f"Send this message to {linkedin_url}: {message}",
    }})


async def _send_linkedin_comment(row: Dict[str, Any], lead: Dict[str, Any]):
    import linkedin_client

    integration = await db.integrations.find_one(
        {"workspace_id": row["workspace_id"], "provider": "linkedin", "status": "connected"},
        {"_id": 0})
    if not integration:
        raise RuntimeError("no connected LinkedIn account")

    post_url = row.get("post_url", "")
    if not post_url:
        raise ValueError("no post URL specified for LinkedIn comment")

    # Extract post URN from URL
    post_urn = post_url.split("/update/")[-1].split("?")[0] if "/update/" in post_url else post_url

    text = _merge_fields(row.get("comment_text", ""), lead)
    result = await linkedin_client.create_comment(integration, post_urn, text)
    await db.send_queue.update_one({"id": row["id"]}, {"$set": {
        "status": "sent", "sent_at": now_iso(), "error": None,
        "provider_message_id": result.get("comment_id"),
        "mocked": False,
    }})


# ----------------------------- Helpers ------------------------------------------
async def _pick_mailbox(workspace_id: str) -> Optional[Dict[str, Any]]:
    """Round-robin across connected mailboxes for a workspace."""
    mailboxes = await db.mailboxes.find(
        {"workspace_id": workspace_id, "status": "connected"}, {"_id": 0}).to_list(20)
    if not mailboxes:
        return None
    today = datetime.now(dt_timezone.utc).isoformat()[:10]
    used = await db.mailbox_usage.find_one({"workspace_id": workspace_id, "date": today})
    usage = used.get("by_mailbox", {}) if used else {}
    best, best_count = None, None
    for m in mailboxes:
        cap = m.get("daily_cap", 50)
        used_count = usage.get(m["id"], 0)
        if used_count >= cap:
            continue
        remaining = cap - used_count
        if best is None or remaining > best_count:
            best, best_count = m, remaining
    return best


async def _mark_sent(mailbox: Dict[str, Any]):
    today = datetime.now(dt_timezone.utc).isoformat()[:10]
    await db.mailbox_usage.update_one(
        {"workspace_id": mailbox["workspace_id"], "date": today},
        {"$inc": {f"by_mailbox.{mailbox['id']}": 1},
         "$setOnInsert": {"workspace_id": mailbox["workspace_id"], "date": today}},
        upsert=True,
    )


def _render(row: Dict[str, Any], lead: Dict[str, Any]) -> tuple:
    """Substitute {{merge_fields}} against the lead for email."""
    import re

    def sub(s: str) -> str:
        def rep(m):
            return str(lead.get(m.group(1).strip(), "") or "")
        return re.sub(r"\{\{\s*(\w+)\s*\}\}", rep, s or "")

    subject = sub(row.get("subject", ""))
    text = sub(row.get("body_text", ""))
    html = sub(row.get("body_html", "")) or "".join(
        f"<p>{p}</p>" for p in text.split("\n\n") if p.strip())
    return subject, html, text


def _merge_fields(text: str, lead: Dict[str, Any]) -> str:
    """Substitute {{merge_fields}} in any text string."""
    import re

    def rep(m):
        return str(lead.get(m.group(1).strip(), "") or "")
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", rep, text or "")


def _next_window_slot(target: datetime, win_start: str, win_end: str,
                       tz: ZoneInfo) -> datetime:
    """Clamp a send time into the campaign's sending window."""
    from datetime import time as _time
    try:
        ws = _time(*map(int, win_start.split(":")))
        we = _time(*map(int, win_end.split(":")))
    except Exception:
        ws, we = _time(9, 0), _time(17, 0)

    if target.weekday() >= 5:
        target += timedelta(days=(7 - target.weekday()))

    target = target.replace(hour=ws.hour, minute=ws.minute, second=0, microsecond=0)
    if not (ws <= target.time() <= we):
        target = target.replace(hour=ws.hour, minute=ws.minute)
    return target


# ----------------------------- Reply polling ------------------------------------
async def run_reply_tick() -> int:
    """Poll sent email threads for replies."""
    from server import _classify_reply

    cutoff = (datetime.now(dt_timezone.utc) - timedelta(days=14)).isoformat()
    rows = await db.send_queue.find({
        "status": "sent", "thread_id": {"$ne": None}, "sent_at": {"$gte": cutoff},
    }, {"_id": 0}).to_list(200)

    found = 0
    for row in rows:
        mailbox = await db.mailboxes.find_one({"id": row.get("mailbox_id")}, {"_id": 0})
        if not mailbox:
            continue
        replies = await mailbox_client.fetch_replies(mailbox, row.get("thread_id"))
        for r in replies:
            exists = await db.conversations.find_one({
                "workspace_id": row["workspace_id"],
                "provider_message_id": r["provider_message_id"],
            })
            if exists:
                continue

            body = r.get("snippet", "")
            classification = _classify_reply(body)
            convo_id = new_id()
            await db.conversations.insert_one({
                "id": convo_id, "workspace_id": row["workspace_id"],
                "campaign_id": row["campaign_id"], "lead_id": row["lead_id"],
                "provider_message_id": r["provider_message_id"],
                "classification": classification, "status": "open",
                "snippet": body[:120], "updated_at": now_iso(),
                "messages": [{"from": "them", "body": body, "at": now_iso()}],
            })
            await db.events.insert_one({
                "id": new_id(), "workspace_id": row["workspace_id"],
                "campaign_id": row["campaign_id"], "lead_id": row["lead_id"],
                "step": row["step"], "type": "replied", "at": now_iso(),
            })
            await _log_activity(row["workspace_id"], row["lead_id"], "pitch", "email_replied",
                                 f"Replied ({classification}): \u201c{body[:80]}\u201d",
                                 {"conversation_id": convo_id})
            found += 1
    return found
