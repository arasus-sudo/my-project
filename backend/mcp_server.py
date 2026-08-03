"""The MCP tool server — mounted at /mcp on the main FastAPI app (server.py).

Auth is verified against the SAME OAuth provider backing /authorize, /register,
/token, /revoke (see mcp_auth.py and server.py's mounting of those routes) —
via ProviderTokenVerifier, which only *verifies* tokens rather than also
building its own copy of the OAuth routes. Passing `auth_server_provider`
directly to FastMCP instead would make it build a second, duplicate set of
those routes internally; token_verifier avoids that.

Every tool resolves the calling AI client's identity through
current_mcp_user(), producing the exact same user-dict shape current_user()
(server.py:134) produces from a human JWT — so a tool body can call the same
Mongo collections/helpers the web app already uses, with workspace isolation
enforced identically.
"""

import os
from datetime import datetime, timezone
from typing import Any, Awaitable, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import HTTPException
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import ProviderTokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl

from mcp_auth import InnoiraOAuthProvider

# Stricter than any per-route human-facing limit in server.py — an AI client
# is code, not a person clicking a UI, so a bug or a bad prompt loop can spam
# calls far faster than a human ever would. Per-workspace (not per-client) so
# it also catches a workspace that connected several AI clients at once.
MCP_RATE_LIMIT_PER_MINUTE = int(os.environ.get("MCP_RATE_LIMIT_PER_MINUTE", "60"))

# Extra Host/Origin values to accept on /mcp, comma-separated. Only needed if
# the service is reached over a hostname that isn't derivable from
# PUBLIC_BASE_URL (a custom domain, a second CNAME, a staging front door) —
# the deployment's own hostname is always allowed automatically below.
MCP_EXTRA_ALLOWED_HOSTS = os.environ.get("MCP_EXTRA_ALLOWED_HOSTS", "")
MCP_EXTRA_ALLOWED_ORIGINS = os.environ.get("MCP_EXTRA_ALLOWED_ORIGINS", "")


def _csv(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _transport_security(issuer_url: str) -> TransportSecuritySettings:
    """Host/Origin allowlist for the /mcp endpoint.

    FastMCP turns DNS-rebinding protection on automatically whenever its `host`
    setting is a loopback address — and 127.0.0.1 is the default, which we never
    override because we mount into an existing FastAPI app rather than letting
    FastMCP bind a socket. The allowlist it picks in that case is localhost-only,
    so every POST /mcp behind a real hostname is rejected with
    421 "Invalid Host header". That failed in production while passing every
    local test, since localhost is precisely the case the default allows.

    Passing settings explicitly keeps the protection on but teaches it the
    hostname this deployment actually answers to.
    """
    issuer_host = urlparse(issuer_url).netloc
    hosts = ["127.0.0.1:*", "localhost:*", "[::1]:*"]
    origins = ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"]
    if issuer_host:
        # Both forms: the bare hostname (what a client sends on the default
        # 443/80 port) and the wildcard-port form for any explicit :port.
        hosts += [issuer_host, f"{issuer_host}:*"]
        origins += [f"https://{issuer_host}", f"https://{issuer_host}:*"]
    frontend = os.environ.get("FRONTEND_URL", "")
    if frontend:
        origins.append(frontend.rstrip("/"))
    hosts += _csv(MCP_EXTRA_ALLOWED_HOSTS)
    origins += _csv(MCP_EXTRA_ALLOWED_ORIGINS)
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=hosts,
        allowed_origins=origins,
    )

READ_ONLY = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)
SAFE_WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False)
DANGEROUS_SEND = ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=True)
GENERIC_CALL = ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=True)

# Substring match against the concrete path a caller passes to call_endpoint
# (not the {param}-templated path OpenAPI reports) — every one of the 6
# curated dangerous-send routes contains one of these verbs, so this alone is
# enough to make sure a generic call to the SAME underlying route can't get a
# lesser scope than the named tool would have required. Any other non-GET
# path defaults to 'write'; anything not matched here that later turns out to
# be a real send is a gap to add a hint for, not a reason to loosen this.
_SEND_PATH_HINTS = ("/launch", "/publish", "/click-to-call", "/send", "/dial")


def _scope_for_path(method: str, path: str) -> str:
    if method.upper() == "GET":
        return "read"
    path_lower = path.lower()
    if any(hint in path_lower for hint in _SEND_PATH_HINTS):
        return "send"
    return "write"


class McpAuthError(Exception):
    """Raised inside a tool body for an auth/scope failure — FastMCP turns
    this into an MCP tool-call error the connected client can show."""


async def _mcp_rate_ok(db, workspace_id: str) -> bool:
    minute_bucket = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
    doc = await db.mcp_rate_limits.find_one_and_update(
        {"workspace_id": workspace_id, "minute": minute_bucket},
        {"$inc": {"count": 1}},
        upsert=True, return_document=True,
    )
    return (doc or {}).get("count", 1) <= MCP_RATE_LIMIT_PER_MINUTE


async def current_mcp_user(db) -> Dict[str, Any]:
    token = get_access_token()
    if not token:
        raise McpAuthError("No authenticated MCP session")
    user = await db.users.find_one({"id": token.subject}, {"_id": 0})
    if not user:
        raise McpAuthError("User not found")
    if not await _mcp_rate_ok(db, user["workspace_id"]):
        raise McpAuthError(
            f"This workspace has hit its MCP rate limit ({MCP_RATE_LIMIT_PER_MINUTE} calls/minute) — wait a moment and try again."
        )
    user["_mcp_scopes"] = token.scopes
    user["_mcp_client_id"] = token.client_id
    return user


def require_scope(user: Dict[str, Any], scope: str) -> None:
    if scope not in (user.get("_mcp_scopes") or []):
        raise McpAuthError(
            f"This connection doesn't have '{scope}' access — reconnect and grant it to use this tool."
        )


async def _call(awaitable: Awaitable) -> Any:
    """Await a route-handler coroutine, turning its HTTPException (e.g. 404) into
    a plain-text tool error instead of leaking a raw exception repr to the client."""
    try:
        return await awaitable
    except HTTPException as e:
        raise ValueError(e.detail) from None


async def require_send_role(user: Dict[str, Any]) -> None:
    """The OAuth 'send' scope check (require_scope) only reflects the role the
    connecting user had at *grant* time — a token issued while they were
    org_admin keeps 'send' in its scopes even if they're demoted afterward.
    Every dangerous-send tool calls the underlying route handler directly
    (bypassing FastAPI's own Depends(require_role(...)) on that route, since
    there's no request for FastAPI to resolve dependencies against), so this
    re-checks the user's *current* role from the database at call time —
    matching what a human hitting the same HTTP route gets on every request."""
    from server import require_role as _require_role
    try:
        await _require_role("org_admin", "campaign_manager")(user=user)
    except HTTPException as e:
        raise McpAuthError(e.detail) from None


def build_mcp_app(db, issuer_url: str, resource_server_url: str) -> FastMCP:
    provider = InnoiraOAuthProvider(db)
    mcp = FastMCP(
        name="Innoira Agentic Suite",
        instructions=(
            "Operate the Innoira Agentic Suite (leads, campaigns, inbox, "
            "signatures, and more) on behalf of a connected workspace."
        ),
        token_verifier=ProviderTokenVerifier(provider),
        auth=AuthSettings(
            issuer_url=AnyHttpUrl(issuer_url),
            resource_server_url=AnyHttpUrl(resource_server_url),
            required_scopes=["read"],
        ),
        transport_security=_transport_security(issuer_url),
    )

    @mcp.tool(annotations=READ_ONLY)
    async def list_signatures() -> List[Dict[str, Any]]:
        """List every email signature saved in the connected workspace."""
        user = await current_mcp_user(db)
        return await db.signatures.find(
            {"workspace_id": user["workspace_id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)

    @mcp.tool(annotations=READ_ONLY)
    async def list_leads(
        search: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> Dict[str, Any]:
        """List leads in the connected workspace. Supports free-text search
        (name/company/email/title) and filtering by pipeline status, paginated."""
        user = await current_mcp_user(db)
        from crm import list_leads as _list_leads
        return await _call(_list_leads(
            page=page, page_size=page_size, search=search, status=status,
            tags=None, owner_id=None, band=None, sort_by=None, user=user,
        ))

    @mcp.tool(annotations=READ_ONLY)
    async def get_lead(lead_id: str) -> Dict[str, Any]:
        """Get a single lead's full record — profile, pipeline deal, and recent
        activity timeline — by ID."""
        user = await current_mcp_user(db)
        from crm import get_lead as _get_lead, lead_timeline as _lead_timeline
        lead = await _call(_get_lead(lead_id=lead_id, user=user))
        lead["timeline"] = await _call(_lead_timeline(lead_id=lead_id, user=user))
        return lead

    @mcp.tool(annotations=READ_ONLY)
    async def list_campaigns() -> List[Dict[str, Any]]:
        """List every campaign in the connected workspace, with send/open/reply
        stats, lead count, and step count for each."""
        user = await current_mcp_user(db)
        from server import list_campaigns as _list_campaigns
        return await _call(_list_campaigns(user=user))

    @mcp.tool(annotations=READ_ONLY)
    async def get_campaign(campaign_id: str) -> Dict[str, Any]:
        """Get a single campaign's full record — steps, targeting, and stats — by ID."""
        user = await current_mcp_user(db)
        from server import get_campaign as _get_campaign
        return await _call(_get_campaign(cid=campaign_id, user=user))

    @mcp.tool(annotations=READ_ONLY)
    async def list_inbox_threads() -> List[Dict[str, Any]]:
        """List the unified inbox's conversation threads (most recently updated
        first), each with the associated lead attached."""
        user = await current_mcp_user(db)
        from server import inbox as _inbox
        return await _call(_inbox(user=user))

    @mcp.tool(annotations=READ_ONLY)
    async def get_thread(thread_id: str) -> Dict[str, Any]:
        """Get a single inbox conversation thread by ID, including its full
        message history and the associated lead."""
        user = await current_mcp_user(db)
        from server import inbox_detail as _inbox_detail
        return await _call(_inbox_detail(cid=thread_id, user=user))

    @mcp.tool(annotations=READ_ONLY)
    async def get_analytics_dashboard() -> Dict[str, Any]:
        """Get the workspace's analytics dashboard: per-campaign funnel stats
        (sent/opened/clicked/replied/bounced by step), pipeline value, and
        workspace-wide totals."""
        user = await current_mcp_user(db)
        from server import analytics_dashboard as _analytics_dashboard
        return await _call(_analytics_dashboard(user=user))

    @mcp.tool(annotations=READ_ONLY)
    async def list_team() -> List[Dict[str, Any]]:
        """List the connected workspace's team members (name, email, role,
        department) — never includes password hashes."""
        user = await current_mcp_user(db)
        from server import list_team as _list_team
        return await _call(_list_team(user=user))

    @mcp.tool(annotations=READ_ONLY)
    async def search(query: str) -> List[Dict[str, Any]]:
        """Search across the whole workspace at once — leads, campaigns, social
        posts, bookings, proposals, and Create EQ projects — by a free-text query."""
        user = await current_mcp_user(db)
        from server import global_search as _global_search
        return await _call(_global_search(q=query, user=user))

    @mcp.tool(annotations=READ_ONLY)
    async def get_audit_log(limit: int = 200) -> List[Dict[str, Any]]:
        """Get the workspace's audit log (most recent first) — every tracked
        action, including who or what (e.g. this MCP connection) performed it."""
        user = await current_mcp_user(db)
        from server import audit_log as _audit_log
        return await _call(_audit_log(limit=limit, user=user))

    # ------------------------- Safe writes (require 'write' scope) -----------

    @mcp.tool(annotations=SAFE_WRITE)
    async def create_lead(
        first_name: str,
        email: str,
        last_name: Optional[str] = "",
        company: Optional[str] = "",
        title: Optional[str] = "",
        phone: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Create a new lead in the connected workspace."""
        user = await current_mcp_user(db)
        require_scope(user, "write")
        from crm import LeadIn, create_lead as _create_lead
        from server import _audit
        body = LeadIn(first_name=first_name, last_name=last_name or "", email=email,
                      company=company or "", title=title or "", phone=phone, tags=tags or [])
        lead = await _call(_create_lead(body=body, user=user))
        await _audit(user, "mcp.create_lead", {"lead_id": lead.get("id"), "email": email,
                                                "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return lead

    @mcp.tool(annotations=SAFE_WRITE)
    async def update_lead(
        lead_id: str,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        email: Optional[str] = None,
        company: Optional[str] = None,
        title: Optional[str] = None,
        phone: Optional[str] = None,
        status: Optional[str] = None,
        owner_id: Optional[str] = None,
        dnc: Optional[bool] = None,
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Update a lead's fields — including moving it to a new pipeline status
        (new/qualified/meeting/proposal/won/lost) via `status`. Only the fields
        you pass are changed."""
        user = await current_mcp_user(db)
        require_scope(user, "write")
        from crm import LeadUpdate, update_lead as _update_lead
        from server import _audit
        body = LeadUpdate(first_name=first_name, last_name=last_name, email=email, company=company,
                          title=title, phone=phone, status=status, owner_id=owner_id, dnc=dnc, tags=tags)
        result = await _call(_update_lead(lead_id=lead_id, body=body, user=user))
        await _audit(user, "mcp.update_lead", {"lead_id": lead_id, "fields": list(body.model_dump(exclude_none=True)),
                                                "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return result

    @mcp.tool(annotations=SAFE_WRITE)
    async def reply_to_thread(thread_id: str, body: str) -> Dict[str, Any]:
        """Send a reply in an existing inbox conversation thread."""
        user = await current_mcp_user(db)
        require_scope(user, "write")
        from server import ReplyIn, reply as _reply, _audit
        result = await _call(_reply(cid=thread_id, body=ReplyIn(body=body), user=user))
        await _audit(user, "mcp.reply_to_thread", {"thread_id": thread_id,
                                                     "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return result

    @mcp.tool(annotations=SAFE_WRITE)
    async def create_campaign(
        name: str,
        steps: List[Dict[str, Any]],
        goal: str = "Book meetings",
        lead_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Create a new email campaign in the connected workspace. Always created
        as a draft — it does NOT start sending; use launch_email_campaign (once
        available) to actually send it. Each step is a dict with at least
        `subject`, `body`, and `day` (days after campaign start)."""
        user = await current_mcp_user(db)
        require_scope(user, "write")
        from server import CampaignIn, SequenceStep, create_campaign as _create_campaign, _audit
        body = CampaignIn(name=name, goal=goal, steps=[SequenceStep(**s) for s in steps],
                          lead_ids=lead_ids or [])
        campaign = await _call(_create_campaign(body=body, user=user))
        await _audit(user, "mcp.create_campaign", {"campaign_id": campaign.get("id"), "name": name,
                                                     "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return campaign

    @mcp.tool(annotations=SAFE_WRITE)
    async def create_signature(name: str, content_html: str = "", content_text: str = "") -> Dict[str, Any]:
        """Create a new email signature in the connected workspace's shared
        signature pool (campaigns pick one by ID; this doesn't set it as default)."""
        user = await current_mcp_user(db)
        require_scope(user, "write")
        from server import SignatureIn, create_signature as _create_signature, _audit
        sig = await _call(_create_signature(body=SignatureIn(name=name, content_html=content_html,
                                                               content_text=content_text), user=user))
        await _audit(user, "mcp.create_signature", {"signature_id": sig.get("id"), "name": name,
                                                      "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return sig

    # ------------------------- Create EQ (carousels) -------------------------
    # Create EQ had no named tool at all, so a connected client saw nothing in
    # its tool list that makes a carousel and would just report it couldn't —
    # even though the routes are reachable via call_endpoint and the grant had
    # the scope for it. Named tools are what make the capability discoverable.

    @mcp.tool(annotations=READ_ONLY)
    async def list_carousels() -> List[Dict[str, Any]]:
        """List every Create EQ carousel project in the connected workspace,
        most recently updated first."""
        user = await current_mcp_user(db)
        from server import carousel_list as _carousel_list
        return await _call(_carousel_list(user=user))

    @mcp.tool(annotations=READ_ONLY)
    async def get_carousel(project_id: str) -> Dict[str, Any]:
        """Get one Create EQ carousel project by ID — all of its slides, plus
        the brand kit and target platform."""
        user = await current_mcp_user(db)
        from server import carousel_get as _carousel_get
        return await _call(_carousel_get(pid=project_id, user=user))

    @mcp.tool(annotations=SAFE_WRITE)
    async def create_carousel(
        topic: str,
        platform: str = "linkedin",
        slide_count: int = 6,
        tone: str = "confident, punchy",
        source_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate a new Create EQ carousel from a topic — writes a full
        Hook → Body → CTA slide narrative and saves it as a project, returning
        the project with its slides. Optionally pass `source_url` to ground the
        copy in a crawled page. Consumes the workspace's carousel_generate
        credits. Inherently slow (crawl plus generation) — expect tens of
        seconds, not a snappy response."""
        user = await current_mcp_user(db)
        require_scope(user, "write")
        from server import CarouselGenIn, carousel_generate as _carousel_generate, _audit
        project = await _call(_carousel_generate(
            body=CarouselGenIn(topic=topic, platform=platform, slide_count=slide_count,
                               tone=tone, source_url=source_url),
            user=user,
        ))
        await _audit(user, "mcp.create_carousel", {"project_id": project.get("id"), "platform": platform,
                                                     "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return project

    @mcp.tool(annotations=SAFE_WRITE)
    async def edit_carousel_slide(project_id: str, slide_index: int, instruction: str) -> Dict[str, Any]:
        """Rewrite one slide of an existing carousel in place from a plain-language
        instruction ("make the hook punchier", "add a supporting stat").
        `slide_index` is 0-based."""
        user = await current_mcp_user(db)
        require_scope(user, "write")
        from server import CarouselEditIn, carousel_edit as _carousel_edit, _audit
        result = await _call(_carousel_edit(
            body=CarouselEditIn(project_id=project_id, slide_index=slide_index, instruction=instruction),
            user=user,
        ))
        await _audit(user, "mcp.edit_carousel_slide", {"project_id": project_id, "slide_index": slide_index,
                                                         "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return result

    # ------------------------- Dangerous sends (require 'send' scope) --------
    # Real money and real outbound contact with real leads. Every tool here
    # requires the 'send' OAuth scope (only grantable by an org_admin/
    # campaign_manager at consent time) AND re-checks the connected user's
    # CURRENT role via require_send_role — see that function's docstring for
    # why both checks matter. Every call is audited before returning.

    @mcp.tool(annotations=DANGEROUS_SEND)
    async def launch_email_campaign(campaign_id: str, skip_pending: bool = False) -> Dict[str, Any]:
        """Launch an email campaign — queues real emails to send to every lead on
        it. By default every lead must already be reviewed (approved/rejected);
        pass skip_pending=true to send only to already-approved leads and skip
        the rest. This sends real email to real people."""
        user = await current_mcp_user(db)
        require_scope(user, "send")
        await require_send_role(user)
        from server import launch_campaign as _launch_campaign, _audit
        result = await _call(_launch_campaign(cid=campaign_id, skip_pending=skip_pending, user=user))
        await _audit(user, "mcp.launch_email_campaign", {"campaign_id": campaign_id,
                                                            "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return result

    @mcp.tool(annotations=DANGEROUS_SEND)
    async def place_voice_call(lead_id: str, agent_id: str) -> Dict[str, Any]:
        """Place a single outbound phone call to a lead right now, using the given
        voice agent. This dials the lead's real phone number immediately and
        costs real money — it is not a simulation or a scheduled action."""
        user = await current_mcp_user(db)
        require_scope(user, "send")
        await require_send_role(user)
        from voice_eq import ClickToCallIn, click_to_call as _click_to_call
        from server import _audit
        call_doc = await _call(_click_to_call(body=ClickToCallIn(lead_id=lead_id, agent_id=agent_id), user=user))
        await _audit(user, "mcp.place_voice_call", {"call_id": call_doc.get("id"), "lead_id": lead_id,
                                                       "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return call_doc

    @mcp.tool(annotations=DANGEROUS_SEND)
    async def launch_voice_campaign(campaign_id: str) -> Dict[str, Any]:
        """Launch a voice campaign. WARNING: this immediately and synchronously
        dials every eligible lead on the campaign, one after another, in this
        single call — it is not queued or spread out, and it does not return
        until it has placed as many real, live outbound phone calls as its
        concurrency cap and credit balance allow. Each call costs real money.
        Only use this when you specifically mean to start calling every lead on
        the campaign right now."""
        user = await current_mcp_user(db)
        require_scope(user, "send")
        await require_send_role(user)
        from voice_eq import launch_voice_campaign as _launch_voice_campaign
        from server import _audit
        result = await _call(_launch_voice_campaign(cid=campaign_id, user=user))
        await _audit(user, "mcp.launch_voice_campaign", {"campaign_id": campaign_id, **{
                                                            k: v for k, v in result.items() if k != "ok"},
                                                           "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return result

    @mcp.tool(annotations=DANGEROUS_SEND)
    async def launch_sms_broadcast(broadcast_id: str) -> Dict[str, Any]:
        """Launch an SMS broadcast — queues real text messages to every lead on
        it (skipping anyone opted out or suppressed). This sends real SMS to
        real phone numbers."""
        user = await current_mcp_user(db)
        require_scope(user, "send")
        await require_send_role(user)
        from sms_eq import launch_broadcast as _launch_sms_broadcast
        from server import _audit
        result = await _call(_launch_sms_broadcast(bid=broadcast_id, user=user))
        await _audit(user, "mcp.launch_sms_broadcast", {"broadcast_id": broadcast_id,
                                                           "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return result

    @mcp.tool(annotations=DANGEROUS_SEND)
    async def launch_whatsapp_broadcast(broadcast_id: str) -> Dict[str, Any]:
        """Launch a WhatsApp broadcast — queues real WhatsApp messages to every
        lead on it (skipping anyone opted out). This sends real WhatsApp
        messages to real phone numbers."""
        user = await current_mcp_user(db)
        require_scope(user, "send")
        await require_send_role(user)
        from whatsapp_eq import launch_broadcast as _launch_whatsapp_broadcast
        from server import _audit
        result = await _call(_launch_whatsapp_broadcast(bid=broadcast_id, user=user))
        await _audit(user, "mcp.launch_whatsapp_broadcast", {"broadcast_id": broadcast_id,
                                                                "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return result

    @mcp.tool(annotations=DANGEROUS_SEND)
    async def publish_social_post(post_id: str) -> Dict[str, Any]:
        """Publish a social post to its target platform right now. The post must
        already be in 'approved' status — this publishes it live immediately,
        it does not schedule or preview it."""
        user = await current_mcp_user(db)
        require_scope(user, "send")
        await require_send_role(user)
        from social_eq import publish_post as _publish_post
        from server import _audit
        result = await _call(_publish_post(pid=post_id, user=user))
        await _audit(user, "mcp.publish_social_post", {"post_id": post_id,
                                                          "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return result

    # ------------------------- Generic OpenAPI escape hatch ------------------
    # Covers the ~490 routes with no curated tool above. search_endpoints/
    # describe_endpoint read app.openapi() directly, so they can never go
    # stale. call_endpoint dispatches through a real in-process ASGI request
    # (not a direct Python call like the curated tools above) — that means it
    # picks up every mounted route's OWN Depends(...) (auth, role gates,
    # request validation) for free, exactly as a human hitting the same URL
    # would, on top of the scope check below.

    @mcp.tool(annotations=READ_ONLY)
    async def search_endpoints(query: str) -> List[Dict[str, Any]]:
        """Search the suite's full API surface (~500 endpoints) by keyword —
        matches against the path, summary, and description. Use this to find
        the right endpoint before describe_endpoint/call_endpoint."""
        from server import app
        schema = app.openapi()
        q = query.lower().strip()
        results = []
        for path, methods in schema.get("paths", {}).items():
            for method, op in methods.items():
                if method.upper() not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                    continue
                haystack = " ".join(filter(None, [
                    path, op.get("summary"), op.get("description"), op.get("operationId"),
                ])).lower()
                if not q or q in haystack:
                    results.append({
                        "method": method.upper(), "path": path,
                        "summary": op.get("summary") or op.get("operationId") or "",
                    })
        return results[:40]

    @mcp.tool(annotations=READ_ONLY)
    async def describe_endpoint(method: str, path: str) -> Dict[str, Any]:
        """Get the full parameter and request-body schema for one specific
        endpoint (as returned by search_endpoints) — check this before calling
        it with call_endpoint so you know exactly what it expects."""
        from server import app
        schema = app.openapi()
        op = (schema.get("paths", {}).get(path) or {}).get(method.lower())
        if not op:
            raise ValueError(f"No such endpoint: {method.upper()} {path}")
        return op

    @mcp.tool(annotations=GENERIC_CALL)
    async def call_endpoint(
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Call any endpoint in the suite directly by HTTP method and exact path
        (get these from search_endpoints/describe_endpoint) — covers the long
        tail of actions with no named tool above. `params` are query-string
        parameters; `body` is the JSON request body for POST/PUT/PATCH.
        Endpoints shaped like a real send (launch/publish/dial/click-to-call)
        still require this connection's 'send' scope even called this way."""
        user = await current_mcp_user(db)
        method = method.upper()
        required_scope = _scope_for_path(method, path)
        require_scope(user, required_scope)
        if required_scope == "send":
            await require_send_role(user)

        import httpx
        from server import app, make_token, _audit
        token = make_token(user["id"], user["workspace_id"], ttl_hours=1 / 60)
        # httpx defaults to a 5s timeout, which silently made every LLM-backed
        # endpoint in the long tail unreachable through this tool — carousel
        # generation alone can deep-crawl 10 pages and then run a completion.
        # The call is in-process (ASGITransport), so a generous ceiling costs
        # nothing; it exists only to stop a wedged handler pinning the session.
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://internal",
                                     timeout=httpx.Timeout(180.0, connect=10.0)) as client:
            resp = await client.request(
                method, path, params=params,
                json=body if method in ("POST", "PUT", "PATCH") else None,
                headers={"Authorization": f"Bearer {token}"},
            )
        try:
            response_body = resp.json()
        except ValueError:
            response_body = resp.text

        await _audit(user, "mcp.call_endpoint", {"method": method, "path": path, "status_code": resp.status_code,
                                                   "via": "mcp", "client_id": user.get("_mcp_client_id")})
        return {"status_code": resp.status_code, "body": response_body}

    return mcp
