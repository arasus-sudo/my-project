"""OAuth 2.1 authorization server backing the MCP integration.

This is deliberately the ONLY new auth mechanism in the codebase — there was
no API-key/PAT/service-account concept anywhere before this (confirmed by
direct search). It exists so an external MCP client (Claude or any other) can
be granted access to one workspace without ever seeing that workspace's
human login credentials.

Identity is not reinvented: every token this mints resolves back to a real
`db.users` document via `resolve_mcp_token()`, producing the exact same shape
`current_user()` (server.py) already produces from a human JWT — every
existing route handler works unmodified regardless of which auth path
reached it. Consent is driven by the existing frontend (a new
`frontend/src/pages/OAuthConsent.jsx` page behind the existing login), not a
separate server-rendered login form.

Scopes (`read`, `write`, `send`) are capped by the *approving user's own
workspace role* at consent time — see `scopes_allowed_for_role()` — mirroring
the `require_role("org_admin","campaign_manager")` gate already enforced on
SMS/WhatsApp broadcast launch. A `viewer` cannot grant a connecting client
more access than a `viewer` already has.
"""

import os
import secrets
import time
from typing import Any, Dict, List, Optional

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    OAuthAuthorizationServerProvider,
    RefreshToken,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

ALL_SCOPES = ["read", "write", "send"]

# Minimum set of workspace roles allowed to GRANT each scope. A role not
# listed for a scope simply can't hand that scope to a connecting client,
# regardless of what the client requests.
SCOPE_ALLOWED_ROLES = {
    "read": {"org_admin", "campaign_manager", "sdr", "viewer"},
    "write": {"org_admin", "campaign_manager", "sdr"},
    "send": {"org_admin", "campaign_manager"},
}

AUTH_CODE_TTL_SECONDS = 60
PENDING_AUTHZ_TTL_SECONDS = 600
ACCESS_TOKEN_TTL_SECONDS = 3600


def scopes_allowed_for_role(role: Optional[str], is_admin: bool) -> List[str]:
    if is_admin:
        return list(ALL_SCOPES)
    return [s for s, roles in SCOPE_ALLOWED_ROLES.items() if role in roles]


def now() -> float:
    return time.time()


class InnoiraOAuthProvider(OAuthAuthorizationServerProvider):
    """Implements mcp.server.auth's provider protocol against Mongo. Every
    method here is called by the SDK's own /register, /authorize, /token,
    /revoke route handlers (see mcp.server.auth.routes.create_auth_routes) —
    this class holds no HTTP-handling logic of its own."""

    def __init__(self, db):
        self.db = db

    # ---- Dynamic client registration (RFC 7591) — MCP clients like Claude
    # self-register on first connect, no manual dev-portal step. ----
    async def get_client(self, client_id: str) -> Optional[OAuthClientInformationFull]:
        doc = await self.db.oauth_clients.find_one({"client_id": client_id}, {"_id": 0})
        return OAuthClientInformationFull(**doc) if doc else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        doc = client_info.model_dump(mode="json", exclude_none=True)
        await self.db.oauth_clients.insert_one(doc)

    # ---- Authorization request: hand off to the consent UI. The actual
    # authorization code is NOT minted here — the user hasn't consented yet.
    # It's minted by the `/oauth/consent/approve` endpoint in server.py once
    # they do, which is a separate HTTP round-trip driven by
    # frontend/src/pages/OAuthConsent.jsx. ----
    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        request_id = secrets.token_urlsafe(24)
        t = now()
        await self.db.oauth_pending_authorizations.insert_one({
            "request_id": request_id,
            "client_id": client.client_id,
            "client_name": client.client_name or client.client_id,
            "scopes": params.scopes or [],
            "code_challenge": params.code_challenge,
            "redirect_uri": str(params.redirect_uri),
            "redirect_uri_provided_explicitly": params.redirect_uri_provided_explicitly,
            "resource": params.resource,
            "state": params.state,
            "created_at": t,
            "expires_at": t + PENDING_AUTHZ_TTL_SECONDS,
        })
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
        return f"{frontend_url}/oauth/consent?request_id={request_id}"

    # ---- Authorization codes ----
    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> Optional[AuthorizationCode]:
        doc = await self.db.oauth_auth_codes.find_one(
            {"code": authorization_code, "client_id": client.client_id}, {"_id": 0}
        )
        if not doc or doc["expires_at"] < now():
            return None
        return AuthorizationCode(
            code=doc["code"], scopes=doc["scopes"], expires_at=doc["expires_at"],
            client_id=doc["client_id"], code_challenge=doc["code_challenge"],
            redirect_uri=doc["redirect_uri"],
            redirect_uri_provided_explicitly=doc["redirect_uri_provided_explicitly"],
            resource=doc.get("resource"), subject=doc.get("subject"),
        )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        # Single-use: delete immediately so a code can never be replayed even
        # if the SDK's own single-use bookkeeping were ever bypassed.
        await self.db.oauth_auth_codes.delete_one({"code": authorization_code.code})
        access_token = secrets.token_urlsafe(32)
        refresh_token = secrets.token_urlsafe(32)
        t = now()
        await self.db.oauth_access_tokens.insert_one({
            "token": access_token, "client_id": client.client_id, "scopes": authorization_code.scopes,
            "subject": authorization_code.subject, "resource": authorization_code.resource,
            "created_at": t, "expires_at": t + ACCESS_TOKEN_TTL_SECONDS,
        })
        await self.db.oauth_refresh_tokens.insert_one({
            # grant_id is a stable, non-secret handle for the "Connected AI
            # clients" admin panel (server.py's /oauth/connected-clients) — the
            # panel lists/revokes grants by this id so the raw refresh token
            # value never has to leave the database.
            "grant_id": secrets.token_urlsafe(16), "token": refresh_token, "client_id": client.client_id,
            "scopes": authorization_code.scopes, "subject": authorization_code.subject,
            "created_at": t, "revoked": False,
        })
        return OAuthToken(
            access_token=access_token, token_type="Bearer", expires_in=ACCESS_TOKEN_TTL_SECONDS,
            scope=" ".join(authorization_code.scopes), refresh_token=refresh_token,
        )

    # ---- Refresh tokens ----
    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> Optional[RefreshToken]:
        doc = await self.db.oauth_refresh_tokens.find_one(
            {"token": refresh_token, "client_id": client.client_id}, {"_id": 0}
        )
        if not doc or doc.get("revoked"):
            return None
        return RefreshToken(token=doc["token"], client_id=doc["client_id"], scopes=doc["scopes"], subject=doc.get("subject"))

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: List[str]
    ) -> OAuthToken:
        # Narrowing to a subset of the originally-granted scopes is allowed;
        # widening isn't — silently clamp rather than trust the request.
        granted = [s for s in (scopes or refresh_token.scopes) if s in refresh_token.scopes]
        access_token = secrets.token_urlsafe(32)
        t = now()
        await self.db.oauth_access_tokens.insert_one({
            "token": access_token, "client_id": client.client_id, "scopes": granted,
            "subject": refresh_token.subject, "resource": None,
            "created_at": t, "expires_at": t + ACCESS_TOKEN_TTL_SECONDS,
        })
        return OAuthToken(
            access_token=access_token, token_type="Bearer", expires_in=ACCESS_TOKEN_TTL_SECONDS,
            scope=" ".join(granted), refresh_token=refresh_token.token,
        )

    # ---- Access tokens ----
    async def load_access_token(self, token: str) -> Optional[AccessToken]:
        doc = await self.db.oauth_access_tokens.find_one({"token": token}, {"_id": 0})
        if not doc or doc["expires_at"] < now():
            return None
        return AccessToken(
            token=doc["token"], client_id=doc["client_id"], scopes=doc["scopes"],
            expires_at=int(doc["expires_at"]), resource=doc.get("resource"), subject=doc.get("subject"),
        )

    # ---- Revocation (RFC 7009) — token is whichever of AccessToken/
    # RefreshToken the SDK's revoke handler matched via load_access_token/
    # load_refresh_token; both share a `.token` field so one code path
    # covers either. ----
    async def revoke_token(self, token) -> None:
        await self.db.oauth_access_tokens.delete_one({"token": token.token})
        await self.db.oauth_refresh_tokens.update_one({"token": token.token}, {"$set": {"revoked": True}})


async def resolve_mcp_token(db, token: str) -> Optional[Dict[str, Any]]:
    """Resolves a raw MCP access-token string to the same user-dict shape
    current_user() produces from a human JWT (server.py:133), plus
    `_mcp_scopes`/`_mcp_client_id` for the scope check below. Returns None
    (never raises) so callers decide the right error for their context."""
    doc = await db.oauth_access_tokens.find_one({"token": token}, {"_id": 0})
    if not doc or doc["expires_at"] < now():
        return None
    user = await db.users.find_one({"id": doc["subject"]}, {"_id": 0})
    if not user:
        return None
    user["_mcp_scopes"] = doc["scopes"]
    user["_mcp_client_id"] = doc["client_id"]
    return user


def has_scope(user: Dict[str, Any], scope: str) -> bool:
    return scope in (user.get("_mcp_scopes") or [])
