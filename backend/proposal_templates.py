"""Per-service proposal templates.

A template is an ordered list of sections, each naming the slot the draft chain
fills it from. This is the doc's "template slot spec": scope, timeline,
deliverables, pricing_table, terms — declared as data, not hardcoded per
proposal, so adding a service is writing config rather than code.

Templates are seeded per workspace on first use and stored in
`proposal_templates`, so a workspace can later edit its own copies without
affecting the defaults.
"""

from typing import Any, Dict, List

from server import db, now_iso, new_id

# Slots the draft chain knows how to produce. A section points at exactly one.
SLOTS = ["executive_summary", "solution_fit", "scope", "timeline", "deliverables",
         "pricing_table", "risks", "terms"]


def _section(key: str, heading: str, slot: str) -> Dict[str, str]:
    return {"key": key, "heading": heading, "slot": slot}


# The default catalogue. Every service shares the same spine (exec summary →
# solution → scope → timeline → pricing → terms); the wording of the headings and
# the emphasis differ per service so the chain is steered, not just relabelled.
DEFAULT_TEMPLATES: List[Dict[str, Any]] = [
    {
        "service": "website_build",
        "name": "Website / Web App Build",
        "blurb": "Fixed-scope design + build engagements.",
        "sections": [
            _section("exec_summary", "Executive Summary", "executive_summary"),
            _section("solution", "Our Approach", "solution_fit"),
            _section("scope", "Scope of Work", "scope"),
            _section("deliverables", "Deliverables", "deliverables"),
            _section("timeline", "Timeline", "timeline"),
            _section("pricing", "Investment", "pricing_table"),
            _section("terms", "Terms", "terms"),
        ],
    },
    {
        "service": "retainer",
        "name": "SEO / Growth Retainer",
        "blurb": "Ongoing monthly engagements with recurring pricing.",
        "sections": [
            _section("exec_summary", "Executive Summary", "executive_summary"),
            _section("solution", "The Growth Plan", "solution_fit"),
            _section("scope", "What's Included Each Month", "scope"),
            _section("timeline", "Ramp & Milestones", "timeline"),
            _section("pricing", "Monthly Investment", "pricing_table"),
            _section("terms", "Engagement Terms", "terms"),
        ],
    },
    {
        "service": "consulting",
        "name": "Consulting Engagement",
        "blurb": "Advisory / strategy work, often time-and-materials.",
        "sections": [
            _section("exec_summary", "Executive Summary", "executive_summary"),
            _section("solution", "How We'll Help", "solution_fit"),
            _section("scope", "Engagement Scope", "scope"),
            _section("timeline", "Phases", "timeline"),
            _section("risks", "Risks & Assumptions", "risks"),
            _section("pricing", "Fees", "pricing_table"),
            _section("terms", "Terms", "terms"),
        ],
    },
    {
        "service": "custom",
        "name": "Custom Proposal",
        "blurb": "A general-purpose structure for anything else.",
        "sections": [
            _section("exec_summary", "Executive Summary", "executive_summary"),
            _section("solution", "Proposed Solution", "solution_fit"),
            _section("scope", "Scope", "scope"),
            _section("timeline", "Timeline", "timeline"),
            _section("pricing", "Investment", "pricing_table"),
            _section("risks", "Risks & Assumptions", "risks"),
            _section("terms", "Terms", "terms"),
        ],
    },
]


async def ensure_seeded(workspace_id: str) -> None:
    """Idempotently give a workspace its own copy of the default templates."""
    existing = await db.proposal_templates.count_documents({"workspace_id": workspace_id})
    if existing:
        return
    for t in DEFAULT_TEMPLATES:
        await db.proposal_templates.insert_one({
            "id": new_id(), "workspace_id": workspace_id, "version": 1,
            "service": t["service"], "name": t["name"], "blurb": t["blurb"],
            "sections": t["sections"], "created_at": now_iso(),
        })


async def list_templates(workspace_id: str) -> List[Dict[str, Any]]:
    await ensure_seeded(workspace_id)
    return await db.proposal_templates.find(
        {"workspace_id": workspace_id}, {"_id": 0}).sort("created_at", 1).to_list(50)


async def get_template(workspace_id: str, template_id: str) -> Dict[str, Any]:
    await ensure_seeded(workspace_id)
    t = await db.proposal_templates.find_one(
        {"workspace_id": workspace_id, "id": template_id}, {"_id": 0})
    if t:
        return t
    # Fall back to the workspace's Custom template so a stale id never dead-ends.
    return await db.proposal_templates.find_one(
        {"workspace_id": workspace_id, "service": "custom"}, {"_id": 0})
