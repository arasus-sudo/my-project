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

MAX_PER_TICK = 5
RETRY_BACKOFF_MIN = 15

# Gap between two consecutive sends of the same step, randomized per recipient.
# A launch that fires every email at the same instant is the single clearest
# automation signal to mailbox providers; 2–5 minutes is the range cold-email
# tooling converges on for looking like a human working through a list.
SEND_SPACING_MIN_SECONDS = 120
SEND_SPACING_MAX_SECONDS = 300

# The queue tick claims anything already due, so give a launch a moment to
# finish writing before its first item becomes eligible.
SEND_LAUNCH_GRACE_SECONDS = 60

# Bounce threshold for auto-quarantine (>2%).
BOUNCE_QUARANTINE_THRESHOLD = 0.02

# Hard per-lead contact-frequency cap: a lead never receives more than this
# many emails in one UTC day, no matter how many queued steps or campaigns
# come due. This is the same invariant Apollo/Lemlist enforce ("one email per
# contact per day") — the last line of defense behind dynamic follow-up
# anchoring, and the thing that stands between a cap-deferral burst and a
# spam complaint.
MAX_EMAILS_PER_LEAD_PER_DAY = 1


def _resolve_spintax(text: str) -> str:
    """Parse and resolve spintax: '{Hi|Hello|Hey}' -> random pick.

    Only `{...}` blocks containing a `|` are treated as spintax. Without the
    `|` requirement, CSS style rules (`.btn { background: #fff; }`) match the
    brace pattern and get truncated, silently destroying an HTML template's
    stylesheet. This matches the suite's own spintax definition (a `{` plus a
    `|` — see the deliverability check in server.py).
    """
    import random
    def _replace(m):
        return random.choice(m.group(1).split("|"))
    return re.sub(r"\{([^}]*\|[^}]*)\}", _replace, text or "")

CHANNEL_ICONS = {
    "email": "✉", "phone_call": "📞", "sms": "💬", "whatsapp": "📱",
    "linkedin_connect": "🔗", "linkedin_message": "💌", "linkedin_comment": "🗨",
}


def _apply_opener(text: str, opener: str) -> str:
    if not text or "{{personalized_opener}}" not in text:
        return text or ""
    if opener:
        return text.replace("{{personalized_opener}}", opener.strip())
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

    # Cumulative spacing per step, so each additional recipient of a step lands
    # a few minutes after the previous one instead of all at the same instant.
    import random as _spacing_rnd
    step_offsets: Dict[int, int] = {}
    not_before = now_local + timedelta(seconds=SEND_LAUNCH_GRACE_SECONDS)

    queued, skipped = 0, 0

    # Batch-fetch all leads in one query instead of N individual find_one calls.
    lead_docs = await db.leads.find(
        {"id": {"$in": lead_ids}, "workspace_id": workspace_id}, {"_id": 0}
    ).to_list(len(lead_ids))
    leads_by_id: Dict[str, Any] = {l["id"]: l for l in lead_docs}

    for lid in lead_ids:
        lead = leads_by_id.get(lid)
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

            offset = step_offsets.get(step_idx, 0)
            send_at = _next_window_slot(
                now_local + timedelta(days=int(step.get("day") or 0)),
                campaign.get("send_window_start", "09:00"),
                campaign.get("send_window_end", "17:00"),
                tz,
                not_before=not_before,
                offset_seconds=offset,
            )
            step_offsets[step_idx] = offset + _spacing_rnd.randint(
                SEND_SPACING_MIN_SECONDS, SEND_SPACING_MAX_SECONDS
            )
            send_at_utc = send_at.astimezone(dt_timezone.utc)

            queue_item = {
                "id": new_id(), "workspace_id": workspace_id,
                "campaign_id": campaign["id"], "lead_id": lid, "step": step_idx,
                "channel": channel,
                "status": "pending",
                "send_at": send_at_utc.isoformat(),
                "attempts": 0, "error": None,
                "created_at": now_iso(),
            }

            if channel == "email":
                import random as _rnd
                ab_subj = step.get("ab_variant_subject", "")
                ab_body = step.get("ab_variant_body", "")
                use_variant = bool(ab_subj or ab_body)
                # Per-step content, when generate-email resolved this step (a
                # step carrying {{ai_email}} / {{ai_subject}} is written fresh
                # for this lead). Falls back to the original behaviour — step 0
                # from the top-level record, later steps from the template with
                # the one shared opener merged in — for records generated before
                # per-step resolution existed.
                resolved = next(
                    (s for s in (personal.get("steps") or []) if s.get("step") == step_idx),
                    None,
                )
                if resolved:
                    subject = resolved.get("subject") or step.get("subject", "")
                    body_text = resolved.get("body") or step.get("body_text") or step.get("body", "")
                    body_html = resolved.get("body_html") or body_text
                elif step_idx == 0:
                    subject = personal.get("subject", step.get("subject", ""))
                    body_html = personal.get("body_html", step.get("body_html") or step.get("body", ""))
                    body_text = personal.get("body", step.get("body_text") or step.get("body", ""))
                else:
                    opener = personal.get("personalized_opener", "")
                    subject = _apply_opener(step.get("subject", ""), opener)
                    body_html = _apply_opener(step.get("body_html") or step.get("body", ""), opener)
                    body_text = _apply_opener(step.get("body_text") or step.get("body", ""), opener)
                if use_variant:
                    variant_letter = _rnd.choice(["A", "B"])
                    if variant_letter == "B":
                        if ab_subj:
                            subject = ab_subj if step_idx > 0 else personal.get("subject", ab_subj)
                        if ab_body:
                            body_html = ab_body if step_idx > 0 else personal.get("body_html", ab_body)
                            body_text = ab_body
                    queue_item["ab_variant"] = variant_letter
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
class DailyCapReached(RuntimeError):
    """Every connected mailbox has spent its daily cap.

    Deliberately not an error: the row is pushed onto the next sending day
    without consuming a retry attempt. Previously this surfaced as a generic
    RuntimeError, which meant three ticks (six minutes) of hitting the cap
    marked the queue row `failed` permanently — the campaign quietly dropped
    every message past the cap instead of sending it the next day.
    """


def _campaign_window(campaign: Dict[str, Any]):
    """(timezone, window_start, window_end) for a campaign, with defaults."""
    try:
        tz = ZoneInfo(campaign.get("timezone") or "UTC")
    except Exception:
        # dt_timezone.utc rather than ZoneInfo("UTC"): the usual reason the
        # lookup failed is a missing tzdata, and that would fail again here.
        tz = dt_timezone.utc
    return (tz,
            campaign.get("send_window_start", "09:00"),
            campaign.get("send_window_end", "17:00"))


async def _defer_row(row: Dict[str, Any], campaign: Dict[str, Any], now: datetime,
                     reason: str, *, next_day: bool) -> str:
    """Push a queue row to its next valid send slot, leaving it pending.

    `next_day=True` skips the rest of today entirely (the daily cap is spent);
    otherwise the row goes to the next open slot, which may still be today if
    the window hasn't opened yet. Attempts are restored to their pre-claim
    value so deferring never counts against the 3-attempt failure budget.
    """
    tz, win_start, win_end = _campaign_window(campaign)
    now_local = now.astimezone(tz)
    if next_day:
        earliest = (now_local + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0)
    else:
        earliest = now_local
    slot = _next_window_slot(earliest, win_start, win_end, tz, not_before=earliest)
    slot_utc = slot.astimezone(dt_timezone.utc)
    await db.send_queue.update_one({"id": row["id"]}, {"$set": {
        "status": "pending",
        "send_at": slot_utc.isoformat(),
        "attempts": row.get("attempts", 0),
        "deferred_reason": reason,
        "deferred_at": now_iso(),
    }})
    return slot_utc.isoformat()


def _followup_slot(actual_sent: datetime, prev_day: int, next_day: int,
                   win_start: str, win_end: str, tz) -> datetime:
    """The earliest window slot a follow-up may go out, anchored to when the
    previous step ACTUALLY sent — not to the launch calendar.

    Follow-ups used to be pinned to launch+N days at enqueue time. When
    throughput constraints (window spill across days, daily caps) delayed the
    first touches, those pinned dates stayed put and follow-ups caught up to
    first touches — a lead whose intro went out on day 2 got their "day 3"
    follow-up on day 3, one day later, or together with it. Anchoring each
    follow-up to its own lead's real last touch makes the sequence stretch
    with throughput instead of compressing.

    Pure function (no DB) so the spacing rules are unit-testable.
    """
    gap_days = max(1, int(next_day or 0) - int(prev_day or 0))
    target_local = actual_sent.astimezone(tz) + timedelta(days=gap_days)
    return _next_window_slot(target_local, win_start, win_end, tz, not_before=target_local)


async def _restamp_next_step(row: Dict[str, Any], campaign: Dict[str, Any],
                             actual_sent: datetime) -> Optional[str]:
    """Re-anchor this lead's next pending follow-up to a real delivery.

    Called after any channel's step dispatches successfully. Only a row still
    in `pending` is touched — one already claimed by an in-flight tick is left
    alone. Returns the new send_at (UTC isoformat) when a row was moved.
    """
    steps = campaign.get("steps") or []
    prev_idx = int(row.get("step", 0))
    nxt_idx = prev_idx + 1
    if nxt_idx >= len(steps):
        return None
    next_row = await db.send_queue.find_one({
        "workspace_id": row["workspace_id"], "campaign_id": row["campaign_id"],
        "lead_id": row["lead_id"], "step": nxt_idx, "status": "pending",
    })
    if not next_row:
        return None
    tz, win_start, win_end = _campaign_window(campaign)
    try:
        slot = _followup_slot(
            actual_sent,
            steps[prev_idx].get("day") or 0,
            steps[nxt_idx].get("day") or 0,
            win_start, win_end, tz,
        )
    except Exception:
        return None
    slot_iso = slot.astimezone(dt_timezone.utc).isoformat()
    result = await db.send_queue.update_one(
        {"id": next_row["id"], "status": "pending"},
        {"$set": {"send_at": slot_iso, "anchored_to_step": prev_idx}},
    )
    if result.modified_count:
        return slot_iso
    return None


async def run_send_tick(base_url: str = "") -> int:
    now = datetime.now(dt_timezone.utc)

    due = await db.send_queue.find({
        "status": "pending",
        "send_at": {"$lte": now.isoformat()},
    }, {"_id": 0}).sort("send_at", 1).to_list(MAX_PER_TICK * 4)

    log.info("run_send_tick: found %s pending items", len(due))
    sent = 0
    # (workspace_id, campaign_id) of rows that actually sent this tick. Derived
    # from real sends rather than slicing `due`, which also holds the rows that
    # were cancelled or skipped before ever dispatching.
    sent_keys: set = set()
    for row in due:
        if sent >= MAX_PER_TICK:
            break

        campaign = await db.campaigns.find_one(
            {"id": row["campaign_id"], "workspace_id": row["workspace_id"]}, {"_id": 0})
        if not campaign or campaign.get("status") != "active":
            await db.send_queue.update_one({"id": row["id"]}, {"$set": {"status": "cancelled"}})
            log.info("run_send_tick: cancelled queue %s — campaign not active", row["id"])
            continue

        if not await _eval_step_condition(row, campaign):
            await db.send_queue.update_one({"id": row["id"]},
                                           {"$set": {"status": "cancelled", "error": "condition not met"}})
            log.info("run_send_tick: cancelled queue %s — condition not met", row["id"])
            continue

        # Re-check the send window at dispatch time, not just at enqueue time.
        # send_at is computed when the campaign launches; if the queue then
        # stalls (downtime, a paused scheduler, a long outage) every overdue row
        # becomes due at once and would fire the instant the tick resumes —
        # potentially at 3am or on a Saturday. Rows that are now outside the
        # window roll forward to the next open slot instead of sending late.
        tz, win_start, win_end = _campaign_window(campaign)
        now_local = now.astimezone(tz)
        next_slot = _next_window_slot(now_local, win_start, win_end, tz, not_before=now_local)
        if next_slot > now_local + timedelta(seconds=1):
            when = await _defer_row(row, campaign, now, "outside_send_window", next_day=False)
            log.info("run_send_tick: deferred queue %s — outside send window, now %s", row["id"], when)
            continue

        channel = row.get("channel", "email")

        # Per-lead contact-frequency cap: if this lead already received an
        # email today (any campaign), roll this row onto tomorrow's window.
        # Dynamic anchoring keeps a lead's own sequence spaced out; this guard
        # additionally covers cross-campaign stacking and any residual race,
        # and is what makes "max 1 email per contact per day" an invariant
        # rather than an intention.
        if channel == "email":
            day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            sent_today = await db.send_queue.count_documents({
                "workspace_id": row["workspace_id"], "lead_id": row["lead_id"],
                "channel": "email", "status": "sent",
                "sent_at": {"$gte": day_start.isoformat()},
            })
            if sent_today >= MAX_EMAILS_PER_LEAD_PER_DAY:
                when = await _defer_row(row, campaign, now,
                                        "lead_daily_frequency_cap", next_day=True)
                log.info("run_send_tick: deferred queue %s to %s — lead emailed today",
                         row["id"], when)
                continue

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
        except DailyCapReached as cap_ex:
            # Not a failure — the day's allowance is spent. Roll the row onto
            # tomorrow's window with its attempt count untouched, so a campaign
            # larger than the daily cap drains over successive days instead of
            # burning three retries in six minutes and being marked failed.
            when = await _defer_row(row, campaign, now, "daily_cap_reached", next_day=True)
            log.info("run_send_tick: deferred queue %s to %s — %s", row["id"], when, cap_ex)
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
        sent_keys.add((row["workspace_id"], row["campaign_id"]))

        # The step actually went out just now — re-anchor this lead's next
        # pending follow-up to it, so their sequence stretches with real
        # throughput instead of follow-ups catching up to delayed first
        # touches. Applies to every channel: a call that went out late delays
        # the email follow-up just the same.
        anchored = await _restamp_next_step(row, campaign, datetime.now(dt_timezone.utc))
        if anchored:
            log.info("run_send_tick: anchored lead %s's step %s to %s",
                     row["lead_id"], row.get("step", 0) + 1, anchored)

    for wid, cid in sent_keys:
        # Use aggregation instead of loading all events into Python.
        type_counts = await db.events.aggregate([
            {"$match": {"campaign_id": cid, "workspace_id": wid}},
            {"$group": {"_id": "$type", "count": {"$sum": 1}}},
        ]).to_list(10)
        counts = {doc["_id"]: doc["count"] for doc in type_counts}
        total = sum(counts.values())
        bounces = counts.get("bounced", 0)
        if total > 20 and bounces / total > BOUNCE_QUARANTINE_THRESHOLD:
            await db.campaigns.update_one({"id": cid}, {"$set": {"status": "quarantined", "quarantined_at": now_iso()}})
            log.warning("auto-quarantined campaign %s: bounce rate %.1f%%", cid, bounces / total * 100)
            continue
        remaining = await db.send_queue.count_documents(
            {"campaign_id": cid, "workspace_id": wid, "status": {"$in": ["pending", "sending"]}}
        )
        if remaining == 0:
            await db.campaigns.update_one({"id": cid}, {"$set": {"status": "completed", "completed_at": now_iso()}})
            log.info("auto-completed campaign %s", cid)

    if sent:
        # Auto-optimize: use aggregation to compute stats per campaign server-side.
        try:
            wid_set = set(wid for wid, _ in sent_keys)
            for wid in wid_set:
                # One aggregation across ALL active campaigns instead of N queries.
                campaign_ids = [c["id"] async for c in db.campaigns.find(
                    {"workspace_id": wid, "status": "active"}, {"_id": 0, "id": 1})]
                if not campaign_ids:
                    continue
                stats = await db.events.aggregate([
                    {"$match": {"workspace_id": wid, "campaign_id": {"$in": campaign_ids}}},
                    {"$group": {
                        "_id": {"cid": "$campaign_id", "type": "$type"},
                        "count": {"$sum": 1},
                    }},
                ]).to_list(1000)
                # Build per-campaign type counts
                camp_stats: Dict[str, Dict[str, int]] = {}
                for doc in stats:
                    cid = doc["_id"]["cid"]
                    camp_stats.setdefault(cid, {})[doc["_id"]["type"]] = doc["count"]
                for cid in campaign_ids:
                    cs = camp_stats.get(cid, {})
                    s = cs.get("sent", 0)
                    b = cs.get("bounced", 0)
                    r = cs.get("replied", 0)
                    if s > 10 and b / s > 0.05:
                        await db.campaigns.update_one({"id": cid}, {"$set": {"status": "paused"}})
                        log.warning("auto-optimize: paused %s (ws:%s) bounce %.0f%%", cid, wid, b/s*100)
                    if s > 30 and r / s > 0.05:
                        # Need batch_size from campaign doc — fetch it once.
                        camp_doc = await db.campaigns.find_one({"id": cid}, {"_id": 0, "batch_size": 1})
                        cur = (camp_doc or {}).get("batch_size", 10)
                        new_b = min(cur + 5, 50)
                        if new_b > cur:
                            await db.campaigns.update_one({"id": cid}, {"$set": {"batch_size": new_b}})
                            log.info("auto-optimize: ramped %s batch %s→%s", cid, cur, new_b)
        except Exception as ex:
            log.warning("auto-optimize tick error: %s", ex)

    log.info("run_send_tick: sent %s item(s)", sent)
    return sent


# ----------------------------- Anchor repair (startup) ---------------------------
async def repair_followup_anchors() -> int:
    """Re-stamp pending follow-ups in resumable campaigns from real send history.

    Campaigns launched before dynamic anchoring existed carry follow-up rows
    pinned to launch+N days; where first touches drained slowly past those
    dates, follow-ups are due to catch up and stack on the same day. This pass
    moves each stale row to `last actually-sent step time + configured gap`
    and ONLY ever pushes later — never earlier — so it is safe to run at every
    startup and cannot disturb healthy schedules.

    Returns the number of rows moved (for the startup log line).
    """
    fixed = 0
    campaigns = await db.campaigns.find(
        {"status": {"$in": ["active", "paused"]}},
        {"_id": 0, "id": 1, "workspace_id": 1, "steps": 1,
         "timezone": 1, "send_window_start": 1, "send_window_end": 1},
    ).to_list(200)
    for c in campaigns:
        steps = c.get("steps") or []
        if len(steps) < 2:
            continue
        wid = c["workspace_id"]
        pend = await db.send_queue.find(
            {"workspace_id": wid, "campaign_id": c["id"], "status": "pending",
             "step": {"$gte": 1}},
            {"_id": 0, "id": 1, "lead_id": 1, "step": 1, "send_at": 1},
        ).to_list(5000)
        if not pend:
            continue
        # Latest actually-sent step per lead in this campaign.
        lead_ids = list({r["lead_id"] for r in pend})
        last_sent: Dict[str, tuple] = {}
        cursor = db.send_queue.find(
            {"workspace_id": wid, "campaign_id": c["id"], "status": "sent",
             "lead_id": {"$in": lead_ids}, "step": {"$lt": len(steps)}},
            {"_id": 0, "lead_id": 1, "step": 1, "sent_at": 1},
        )
        async for s in cursor:
            cur = last_sent.get(s["lead_id"])
            if not cur or s["step"] > cur[0]:
                last_sent[s["lead_id"]] = (s["step"], s["sent_at"])
        tz, win_start, win_end = _campaign_window(c)
        for r in pend:
            anchor = last_sent.get(r["lead_id"])
            if not anchor or anchor[0] >= r["step"] or not anchor[1]:
                continue
            try:
                anchor_dt = datetime.fromisoformat(anchor[1])
                slot = _followup_slot(anchor_dt, steps[anchor[0]].get("day") or 0,
                                      steps[r["step"]].get("day") or 0,
                                      win_start, win_end, tz)
                slot_iso = slot.astimezone(dt_timezone.utc).isoformat()
            except Exception:
                continue
            # Later only: a row already scheduled beyond the computed slot is
            # either correctly spaced or deliberately deferred — leave it be.
            if slot_iso > r["send_at"]:
                res = await db.send_queue.update_one(
                    {"id": r["id"], "status": "pending"},
                    {"$set": {"send_at": slot_iso, "anchored_to_step": anchor[0],
                              "deferred_reason": "anchor_repair"}},
                )
                fixed += res.modified_count
    return fixed


# ----------------------------- Email sender ------------------------------------
async def _send_email(row: Dict[str, Any], lead: Dict[str, Any], base_url: str,
                      campaign: Dict[str, Any]):
    from server import inject_tracking
    from optout import check_optout_before_send

    mailbox = await _pick_mailbox(row["workspace_id"])
    if not mailbox:
        # Two very different situations produce no mailbox, and conflating them
        # is what used to destroy queued mail: every mailbox being at its daily
        # cap is a normal, expected end to the sending day, while having no
        # connected mailbox at all is a real misconfiguration.
        connected = await db.mailboxes.count_documents(
            {"workspace_id": row["workspace_id"], "status": "connected"})
        if connected:
            raise DailyCapReached(f"all {connected} mailbox(es) at daily cap")
        raise RuntimeError("no eligible mailbox")

    # Check opt-out before sending
    if await check_optout_before_send(row["workspace_id"], lead["email"]):
        log.info("optout: skipping email to %s (opted out)", lead["email"])
        # Mark as skipped due to opt-out
        await db.send_queue.update_one({"id": row["id"]}, {"$set": {
            "status": "cancelled", "error": "recipient opted out",
            "attempts": row.get("attempts", 0) + 1,
            "send_at": (datetime.now(dt_timezone.utc) + timedelta(days=1)).isoformat(),
        }})
        return

    subject, html, text = _render(row, lead)

    # Unsubscribe footer — issued per-recipient, appended before tracking so
    # the unsubscribe link is included in click tracking.
    from optout import issue_unsubscribe, append_unsubscribe_footer, append_unsubscribe_footer_text
    unsub_url = await issue_unsubscribe(
        row["workspace_id"], lead["email"], base_url,
        lead_id=row["lead_id"], campaign_id=row["campaign_id"],
    )
    html = append_unsubscribe_footer(html, unsub_url)
    text = append_unsubscribe_footer_text(text, unsub_url)

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


# ----------------------------- Warmup progression -------------------------------
# The cap rises by a fixed amount every warmup day and stops at the mailbox's
# own `warmup_target` (set from its configured daily_cap when it was created).
#
# The previous curve stepped in week-long plateaus (5/10/20/30/50) and ignored
# warmup_target entirely, so a mailbox configured for 200/day was capped at 50
# forever and its own setting silently did nothing.
WARMUP_START_CAP = 5
WARMUP_DAILY_INCREMENT = 3
WARMUP_DEFAULT_TARGET = 50


def _warmup_daily_cap(day: int, target: int = WARMUP_DEFAULT_TARGET) -> int:
    """Sends allowed on warmup day `day`, ramping toward `target`.

    Day 1 = 5, then +3/day: 5, 8, 11 … reaching a 50 target on day 16. Never
    returns less than 1 — a target of 0 would otherwise wedge the mailbox at a
    cap nothing can satisfy.
    """
    target = max(1, int(target or WARMUP_DEFAULT_TARGET))
    day = max(1, int(day or 1))
    return max(1, min(target, WARMUP_START_CAP + (day - 1) * WARMUP_DAILY_INCREMENT))


# ----------------------------- Condition evaluation -----------------------------
CONDITION_MAP = {
    "always": lambda ws, lead, ev: True,
    "if_no_reply": lambda ws, lead, ev: not ev.get("replied"),
    "if_replied": lambda ws, lead, ev: ev.get("replied", False),
    "if_opened_no_reply": lambda ws, lead, ev: ev.get("opened", False) and not ev.get("replied"),
    "if_clicked": lambda ws, lead, ev: ev.get("clicked", False),
    "if_not_opened": lambda ws, lead, ev: not ev.get("opened"),
    "if_bounced": lambda ws, lead, ev: ev.get("bounced", False),
}


async def _get_lead_events(wid: str, lid: str) -> Dict[str, bool]:
    """Return a dict of event types that occurred for this lead+workspace."""
    cur = db.events.find({"workspace_id": wid, "lead_id": lid}, {"_id": 0, "type": 1})
    types = set()
    async for e in cur:
        types.add(e.get("type"))
    return {t: True for t in types}


async def _eval_step_condition(row: Dict[str, Any], campaign: Dict[str, Any]) -> bool:
    """Evaluate whether a queued step should be sent based on its condition."""
    step_idx = row.get("step", 0)
    steps = campaign.get("steps") or []
    if step_idx >= len(steps):
        return True  # fallback: send
    step = steps[step_idx]
    condition = step.get("condition", "always")

    cond_fn = CONDITION_MAP.get(condition)
    if cond_fn is None:
        return True  # unknown condition -> send

    events = await _get_lead_events(row["workspace_id"], row["lead_id"])
    return cond_fn(row["workspace_id"], None, events)


# ----------------------------- Helpers ------------------------------------------
async def _pick_mailbox(workspace_id: str) -> Optional[Dict[str, Any]]:
    """Round-robin across connected mailboxes for a workspace."""
    all_mailboxes = await db.mailboxes.find(
        {"workspace_id": workspace_id, "status": "connected"}, {"_id": 0}).to_list(20)
    # A mailbox with no refresh token can never send for real (the expired
    # access token can't be refreshed) — it would silently mock every send.
    # Prefer token-bearing mailboxes; only fall back to token-less ones when
    # no real mailbox exists (demo mode, where mock sends are the point).
    real = [m for m in all_mailboxes if m.get("refresh_token_enc")]
    mailboxes = real or all_mailboxes
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
    # Keep the mailbox doc's own counters in sync — the Mailboxes/Analytics
    # pages render "sent today" straight off the doc, and it was stamped 0 at
    # creation with nothing ever writing it again, so the page always read 0
    # no matter how much actually went out.
    if mailbox.get("sent_date") != today:
        await db.mailboxes.update_one(
            {"id": mailbox["id"]},
            {"$set": {"sent_today": 1, "sent_date": today}},
        )
    else:
        await db.mailboxes.update_one(
            {"id": mailbox["id"]},
            {"$inc": {"sent_today": 1}},
        )
    # Advance warmup day
    warmup_enabled = mailbox.get("warmup_enabled", True)
    if warmup_enabled:
        warmup_day = mailbox.get("warmup_day", 1)
        last_sent_date = mailbox.get("last_sent_date", "")
        if last_sent_date and last_sent_date != today:
            # Ceiling is generous rather than 30 so the ramp can still reach a
            # high warmup_target; the cap itself is clamped to the target below.
            new_day = min(warmup_day + 1, 365)
            new_cap = _warmup_daily_cap(new_day, mailbox.get("warmup_target", WARMUP_DEFAULT_TARGET))
            await db.mailboxes.update_one(
                {"id": mailbox["id"]},
                {"$set": {"warmup_day": new_day, "daily_cap": new_cap,
                          "last_sent_date": today}},
            )
        else:
            await db.mailboxes.update_one(
                {"id": mailbox["id"]},
                {"$set": {"last_sent_date": today}},
            )


def _render(row: Dict[str, Any], lead: Dict[str, Any]) -> tuple:
    """Substitute {{merge_fields}} then resolve spintax for email."""
    import re

    def sub(s: str) -> str:
        def rep(m):
            return str(lead.get(m.group(1).strip(), "") or "")
        return re.sub(r"\{\{\s*(\w+)\s*\}\}", rep, s or "")

    subject = _resolve_spintax(sub(row.get("subject", "")))
    text = _resolve_spintax(sub(row.get("body_text", "")))
    html = _resolve_spintax(sub(row.get("body_html", ""))) or "".join(
        f"<p>{p}</p>" for p in text.split("\n\n") if p.strip())
    return subject, html, text


def _merge_fields(text: str, lead: Dict[str, Any]) -> str:
    """Substitute {{merge_fields}} in any text string."""
    import re

    def rep(m):
        return str(lead.get(m.group(1).strip(), "") or "")
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", rep, text or "")


def _next_window_slot(target: datetime, win_start: str, win_end: str,
                       tz: ZoneInfo, not_before: Optional[datetime] = None,
                       offset_seconds: int = 0) -> datetime:
    """The local datetime a step should actually send at.

    Guarantees, in order: on a weekday, inside the campaign's daily window,
    never before `not_before`, and displaced by `offset_seconds` from the
    campaign's other sends. `offset_seconds` is a budget spent against each
    day's remaining window and carried onto following business days, so a
    batch larger than one day's window spills forward instead of piling up
    at the window's edge.
    """
    from datetime import time as _time
    try:
        ws = _time(*map(int, win_start.split(":")))
        we = _time(*map(int, win_end.split(":")))
    except Exception:
        ws, we = _time(9, 0), _time(17, 0)
    if we <= ws:
        ws, we = _time(9, 0), _time(17, 0)

    earliest = target
    if not_before is not None and earliest < not_before:
        earliest = not_before

    remaining = max(0, offset_seconds)
    day = earliest.date()
    while True:
        if day.weekday() < 5:
            win_close = datetime.combine(day, we, tzinfo=tz)
            start = max(datetime.combine(day, ws, tzinfo=tz), earliest)
            if start <= win_close:
                available = (win_close - start).total_seconds()
                if remaining <= available:
                    return (start + timedelta(seconds=remaining)).replace(microsecond=0)
                remaining -= available
        day += timedelta(days=1)
        earliest = datetime.combine(day, ws, tzinfo=tz)


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
            from server import _sync_campaign_to_crm
            await _sync_campaign_to_crm(row["workspace_id"], row["campaign_id"], row["lead_id"], "replied")
            await _log_activity(row["workspace_id"], row["lead_id"], "pitch", "email_replied",
                                 f"Replied ({classification}): \u201c{body[:80]}\u201d",
                                 {"conversation_id": convo_id})
            found += 1
    return found
