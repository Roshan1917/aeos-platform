from __future__ import annotations

import time

import pytest

from src.auth.ingest_token import (
    InvalidIngestToken,
    TOKEN_PREFIX,
    display_prefix,
    mint,
    verify,
)

SECRET = "x" * 32


def test_mint_verify_roundtrip():
    token = mint(tenant_id="tenant-a", token_id="kid-1", secret=SECRET)
    assert token.startswith(TOKEN_PREFIX)
    claims = verify(token, secret=SECRET)
    assert claims.tenant_id == "tenant-a"
    assert claims.token_id == "kid-1"
    assert claims.expires_at is None


def test_mint_with_expiry_decodes():
    exp = int(time.time()) + 3600
    token = mint(tenant_id="tenant-a", token_id="kid-1", secret=SECRET, expires_at=exp)
    claims = verify(token, secret=SECRET)
    assert claims.expires_at == exp


def test_expired_token_rejected():
    past = int(time.time()) - 10
    token = mint(tenant_id="t", token_id="k", secret=SECRET, expires_at=past)
    with pytest.raises(InvalidIngestToken, match="expired"):
        verify(token, secret=SECRET)


def test_tampered_signature_rejected():
    token = mint(tenant_id="t", token_id="k", secret=SECRET)
    # Flip last char of the signature
    body = token[:-1] + ("a" if token[-1] != "a" else "b")
    with pytest.raises(InvalidIngestToken, match="bad_signature"):
        verify(body, secret=SECRET)


def test_wrong_secret_rejected():
    token = mint(tenant_id="t", token_id="k", secret=SECRET)
    with pytest.raises(InvalidIngestToken, match="bad_signature"):
        verify(token, secret="y" * 32)


def test_wrong_prefix_rejected():
    with pytest.raises(InvalidIngestToken, match="wrong_prefix"):
        verify("bearer.something", secret=SECRET)


def test_short_secret_rejected_at_mint():
    with pytest.raises(ValueError):
        mint(tenant_id="t", token_id="k", secret="short")


def test_display_prefix_safe():
    token = mint(tenant_id="t", token_id="k", secret=SECRET)
    p = display_prefix(token)
    assert p.startswith(TOKEN_PREFIX)
    assert len(p) <= len(TOKEN_PREFIX) + 12


def test_two_tokens_with_same_inputs_differ():
    """Nonce ensures opaque variability — kids are unique anyway, but defence in depth."""
    a = mint(tenant_id="t", token_id="k", secret=SECRET, issued_at=1000)
    b = mint(tenant_id="t", token_id="k", secret=SECRET, issued_at=1000)
    assert a != b
