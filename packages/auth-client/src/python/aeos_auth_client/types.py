from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    tenant_id: str
    roles: list[str]
    agent_contract_id: Optional[str] = None


@dataclass(frozen=True)
class PermissionCheckResult:
    allowed: bool
    reason: Optional[str] = None


@dataclass(frozen=True)
class AgentIdentityVerification:
    valid: bool
    agent_id: Optional[str] = None
    uop_id: Optional[str] = None
