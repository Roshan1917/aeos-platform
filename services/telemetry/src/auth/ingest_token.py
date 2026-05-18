"""
Telemetry ingest token codec — HMAC-signed opaque tokens.

Format: ``aeos_tlm_<b64url(payload_json)>.<b64url(hmac_sha256)>``

Payload JSON:
    {"tid": "<tenant_id>", "kid": "<token_id>", "iat": <unix>, "exp": <unix?>}

Verification is local-only: HMAC compare + expiry check. Revocation is a
separate concern handled by the in-memory revocation cache that the FastAPI
dependency consults.
"""
from __future__ import annotations

import base64
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from hashlib import sha256
from typing import Optional

TOKEN_PREFIX = "aeos_tlm_"


class InvalidIngestToken(Exception):
    pass


@dataclass(frozen=True)
class IngestTokenClaims:
    tenant_id: str
    token_id: str
    issued_at: int
    expires_at: Optional[int]


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _sign(payload_b64: str, secret: str) -> str:
    sig = hmac.new(secret.encode("utf-8"), payload_b64.encode("ascii"), sha256).digest()
    return _b64url_encode(sig)


def mint(
    *,
    tenant_id: str,
    token_id: str,
    secret: str,
    expires_at: Optional[int] = None,
    issued_at: Optional[int] = None,
) -> str:
    if not secret or len(secret) < 32:
        raise ValueError("signing secret must be at least 32 bytes")
    payload = {
        "tid": tenant_id,
        "kid": token_id,
        "iat": int(issued_at if issued_at is not None else time.time()),
    }
    if expires_at is not None:
        payload["exp"] = int(expires_at)
    # Opaque entropy — not strictly needed because kid is unique, but blocks
    # any guess-the-payload attack and matches industry conventions for API
    # tokens that look random to the user.
    payload["nonce"] = secrets.token_urlsafe(8)
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _sign(payload_b64, secret)
    return f"{TOKEN_PREFIX}{payload_b64}.{sig}"


def verify(token: str, *, secret: str, now: Optional[int] = None) -> IngestTokenClaims:
    if not token.startswith(TOKEN_PREFIX):
        raise InvalidIngestToken("wrong_prefix")
    body = token[len(TOKEN_PREFIX) :]
    try:
        payload_b64, sig_b64 = body.split(".", 1)
    except ValueError as exc:
        raise InvalidIngestToken("malformed") from exc

    expected = _sign(payload_b64, secret)
    if not hmac.compare_digest(expected, sig_b64):
        raise InvalidIngestToken("bad_signature")

    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception as exc:
        raise InvalidIngestToken("bad_payload") from exc

    tenant_id = payload.get("tid")
    token_id = payload.get("kid")
    iat = payload.get("iat")
    if not tenant_id or not token_id or iat is None:
        raise InvalidIngestToken("missing_claims")

    exp = payload.get("exp")
    current = now if now is not None else int(time.time())
    if exp is not None and current >= int(exp):
        raise InvalidIngestToken("expired")

    return IngestTokenClaims(
        tenant_id=str(tenant_id),
        token_id=str(token_id),
        issued_at=int(iat),
        expires_at=int(exp) if exp is not None else None,
    )


def display_prefix(token: str) -> str:
    """First 12 chars after ``aeos_tlm_`` — safe to store and show in admin lists."""
    body = token[len(TOKEN_PREFIX) :] if token.startswith(TOKEN_PREFIX) else token
    return TOKEN_PREFIX + body[:12]
