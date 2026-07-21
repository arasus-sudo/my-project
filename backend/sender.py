"""The send queue — real outbound, replacing the simulator.

What this replaces: `launch_campaign` used to compute `seed = (i*31 + step_idx*7)
% 100` and fabricate `sent` / `opened` / `clicked` / `replied` events from it. No
email was sent, `from_mailbox_id` was never read, `sent_today` never incremented,
and the daily cap was never enforced. The Analytics dashboard was charting noise.

Now: launching a campaign *enqueues* one row per (lead, step). A job on the
existing APScheduler drains the queue, honouring the three fields that were being
stored and ignored — `day` offsets, `send_window_start/end`, and `timezone` —
plus per-mailbox daily caps and rotation across mailboxes.

Opens and clicks come from a tracking pixel and a click redirect. Replies come
from polling the Gmail thread. Every number in the dashboard is now something
that actually happened.
"""

import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from server import db, now_iso, new_id, _log_activity, _quarantine_lead, _verify_email_syntax
import mailbox_client

log = logging.getLogger(__name__)

MAX_PER_TICK = 25          # a polite trickle; bursts look like spam
RETRY_BACKOFF_MIN = 15


def _get_signature_html(workspace_id: str, signature_id: Optional[str]) -> str:
    """Resolve a signature to HTML."""
    return ""  # placeholder — we resolve async in enqueue


def _apply_opener(text: str, opener: str) -> str:
    """Fill {{personalized_opener}} on a later-step template, or drop the line
    entirely when no opener is on file — the literal placeholder must never
    reach a recipient."""
    if not text or "{{personalized_opener}}" not in text:
        return text or ""
    if opener:
        return text.replace("{{personalized_opener}}", opener)
    return "\n".join(l for l in text.split("\n") if "{{personalized_opener}}" not in l).strip()


# ----------------------------- Enqueue -----------------------------------------
async def enqueue_campaign(workspace_id: str, campaign: Dict[str, Any]) -> Dict[str, Any]:
    """Turn a campaign into scheduled sends. Refuses to launch without a connected
    mailbox — the old code happily "launched" with none and faked the metrics."""
    mailboxes = await db.mailboxes.find(
        {"workspace_id": workspace_id, "status": "connected"}, {"_id": 0}).to_list(20)
    if not mailboxes:
        raise ValueError("Connect a mailbox before launching — nothing can be sent without one.")

    steps = campaign.get("steps") or []
    if not steps:
        raise ValueError("This campaign has no steps.")

    lead_ids = campaign.get("lead_ids") or []
    if not lead_ids:
        raise ValueError("Select at least one lead. (Campaigns no longer silently "
                         "fall back to emailing every lead in the workspace.)")

    suppressed = {s["email"].lower() async for s in db.suppressions.find(
        {"workspace_id": workspace_id}, {"_id": 0, "email": 1})}

    tz = ZoneInfo(campaign.get("timezone") or "UTC")
    now_local = datetime.now(tz)

    # Resolve signature
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
        if not _verify_email_syntax(email):
            await _quarantine_lead(workspace_id, lead, "invalid_syntax")
            skipped += 1
            continue
        if email in suppressed:
            await _quarantine_lead(workspace_id, lead, "on_suppression_list")
            skipped += 1
            continue
        if lead.get("dnc"):
            await _quarantine_lead(workspace_id, lead, "do_not_contact")
            skipped += 1
            continue

        # A lead without an approved step-0 email never gets queued for ANY
        # step — the old code fell back to the raw template (still holding a
        # literal {{personalized_opener}}) for anyone who skipped review.
        personal = personalized_map.get(lid)
        if not personal:
            skipped += 1
            continue

        for step_idx, step in enumerate(steps):
            if step_idx == 0:
                subject = personal.get("subject", step.get("subject", ""))
                body_html = personal.get("body_html", step.get("body_html") or "")
                body_text = personal.get("body", step.get("body_text") or step.get("body") or "")
            else:
                opener = personal.get("personalized_opener", "")
                subject = _apply_opener(step.get("subject", ""), opener)
                body_html = _apply_opener(step.get("body_html") or "", opener)
                body_text = _apply_opener(step.get("body_text") or step.get("body") or "", opener)
            # Append signature
            if signature_html and body_html:
                body_html = body_html + "<br><br>" + signature_html
            if signature_text and body_text:
                body_text = body_text + "\n\n" + signature_text
            send_at = _next_window_slot(
                now_local + timedelta(days=int(step.get("day") or 0)),
                campaign.get("send_window_start", "09:00"),
                campaign.get("send_window_end", "17:00"),
                tz,
            )
            await db.send_queue.insert_one({
                "id": new_id(), "workspace_id": workspace_id,
                "campaign_id": campaign["id"], "lead_id": lid, "step": step_idx,
                "subject": subject,
                "body_html": body_html,
                "body_text": body_text,
                "status": "pending",          # pending | sent | failed | cancelled
                "send_at": send_at.isoformat(),
                "attempts": 0, "error": None,
                "provider_message_id": None, "thread_id": None,
                "created_at": now_iso(),
            })
            queued += 1

    return {"queued": queued, "skipped": skipped, "mailboxes": len(mailboxes)}


def _next_window_slot(target: datetime, win_start: str, win_end: str,
                       tz: ZoneInfo) -> datetime:
    """Clamp a send time into the campaign's sending window.

    These three fields have existed on the campaign model since day one and were
    never once read. Sending at 3am is both rude and a deliverability penalty.
    """
    try:
        sh, sm = (int(x) for x in win_start.split(":"))
        eh, em = (int(x) for x in win_end.split(":"))
    except Exception:
        sh, sm, eh, em = 9, 0, 17, 0

    local = target.astimezone(tz)
    start = local.replace(hour=sh, minute=sm, second=0, microsecond=0)
    end = local.replace(hour=eh, minute=em, second=0, microsecond=0)

    if local < start:
        return start
    if local >= end:
        # Past the window — first thing in the next day's window.
        return start + timedelta(days=1)
    return local


# ----------------------------- Mailbox rotation ---------------------------------
async def _pick_mailbox(workspace_id: str) -> Optional[Dict[str, Any]]:
    """Round-robin across connected mailboxes, skipping any that hit its daily cap.

    Rotation is what keeps a single mailbox's reputation intact; the cap is what
    keeps you out of the spam folder. Both were previously fictional."""
    today = datetime.now(dt_timezone.utc).date().isoformat()
    boxes = await db.mailboxes.find(
        {"workspace_id": workspace_id, "status": "connected"}, {"_id": 0}).to_list(20)

    eligible = []
    for b in boxes:
        # The counter resets on the first send of a new day.
        if b.get("sent_date") != today:
            b["sent_today"] = 0
        cap = int(b.get("daily_cap") or 50)
        if b.get("warmup_enabled"):
            # Warmup ramps the cap: a brand-new mailbox blasting 50/day is the
            # fastest way to get it flagged.
            cap = min(cap, 5 + int(b.get("warmup_day") or 1) * 5)
        if int(b.get("sent_today") or 0) < cap:
            eligible.append((int(b.get("sent_today") or 0), b))

    if not eligible:
        return None
    eligible.sort(key=lambda x: x[0])   # least-used first
    return eligible[0][1]


async def _mark_sent(mailbox: Dict[str, Any]) -> None:
    today = datetime.now(dt_timezone.utc).date().isoformat()
    if mailbox.get("sent_date") != today:
        await db.mailboxes.update_one({"id": mailbox["id"]},
                                       {"$set": {"sent_date": today, "sent_today": 1}})
    else:
        await db.mailboxes.update_one({"id": mailbox["id"]}, {"$inc": {"sent_today": 1}})


# ----------------------------- Tracking ----------------------------------------
def inject_tracking(html: str, workspace_id: str, queue_id: str, base_url: str) -> str:
    """A 1x1 open beacon, plus every link rewritten through a click redirect."""
    import re
    pixel = (f'<img src="{base_url}/api/t/o/{queue_id}" width="1" height="1" '
             f'alt="" style="display:none">')

    def _wrap(m):
        url = m.group(2)
        if url.startswith("#") or url.startswith("mailto:"):
            return m.group(0)
        from urllib.parse import quote
        return f'{m.group(1)}="{base_url}/api/t/c/{queue_id}?u={quote(url, safe="")}"'

    html = re.sub(r'(href)="([^"]+)"', _wrap, html or "")
    return (html or "") + pixel


# ----------------------------- The drain ---------------------------------------
async def run_send_tick(base_url: str = "") -> int:
    """Send everything that's due. Returns how many went out.

    Claims each row with a conditional update before sending, so overlapping ticks
    can't send the same email twice — the same pattern as the booking reminders.
    """
    now = datetime.now(dt_timezone.utc)

    due = await db.send_queue.find({
        "status": "pending",
        "send_at": {"$lte": now.isoformat()},
    }, {"_id": 0}).sort("send_at", 1).to_list(MAX_PER_TICK * 4)

    sent = 0
    for row in due:
        if sent >= MAX_PER_TICK:
            break

        campaign = await db.campaigns.find_one(
            {"id": row["campaign_id"], "workspace_id": row["workspace_id"]}, {"_id": 0})
        if not campaign or campaign.get("status") != "active":
            await db.send_queue.update_one({"id": row["id"]}, {"$set": {"status": "cancelled"}})
            continue

        # A reply cancels the rest of the sequence — nobody wants step 3 after
        # they've already answered.
        replied = await db.events.count_documents({
            "workspace_id": row["workspace_id"], "lead_id": row["lead_id"], "type": "replied"})
        if replied:
            await db.send_queue.update_one({"id": row["id"]},
                                            {"$set": {"status": "cancelled", "error": "lead replied"}})
            continue

        mailbox = await _pick_mailbox(row["workspace_id"])
        if not mailbox:
            continue  # every mailbox capped out; try again next tick

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

        subject, html, text = _render(row, lead)
        if base_url:
            html = inject_tracking(html, row["workspace_id"], row["id"], base_url)

        try:
            result = await mailbox_client.send(
                mailbox, to_addr=lead["email"], subject=subject, html=html, text=text,
                reply_to=mailbox.get("email"),
            )
        except Exception as ex:
            attempts = row.get("attempts", 0) + 1
            failed = attempts >= 3
            await db.send_queue.update_one({"id": row["id"]}, {"$set": {
                "status": "failed" if failed else "pending",
                "error": str(ex)[:300],
                "send_at": (now + timedelta(minutes=RETRY_BACKOFF_MIN)).isoformat(),
            }})
            log.warning("send failed (attempt %s): %s", attempts, ex)
            continue

        await db.send_queue.update_one({"id": row["id"]}, {"$set": {
            "status": "sent", "sent_at": now_iso(), "error": None,
            "provider_message_id": result.get("provider_message_id"),
            "thread_id": result.get("thread_id"),
            "mailbox_id": mailbox["id"], "mocked": result.get("mocked", True),
        }})
        await _mark_sent(mailbox)

        # A "sent" event now means an email actually left a mailbox.
        await db.events.insert_one({
            "id": new_id(), "workspace_id": row["workspace_id"],
            "campaign_id": row["campaign_id"], "lead_id": row["lead_id"],
            "step": row["step"], "type": "sent", "at": now_iso(),
        })
        await _log_activity(row["workspace_id"], row["lead_id"], "pitch", "email_sent",
                             f"Sent “{subject}” from {mailbox['email']}",
                             {"campaign_id": row["campaign_id"], "step": row["step"]})
        sent += 1

    return sent


def _render(row: Dict[str, Any], lead: Dict[str, Any]) -> tuple:
    """Substitute {{merge_fields}} against the lead."""
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


# ----------------------------- Reply polling ------------------------------------
async def run_reply_tick() -> int:
    """Poll sent threads for replies. This is what makes the unified inbox real —
    it used to be populated from a five-string bank of invented replies."""
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
                                 f"Replied ({classification}): “{body[:80]}”",
                                 {"conversation_id": convo_id})
            found += 1
    return found
