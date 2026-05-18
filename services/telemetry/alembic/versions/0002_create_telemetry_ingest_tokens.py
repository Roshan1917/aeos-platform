"""create telemetry_ingest_tokens table

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-06
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telemetry_ingest_tokens",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("prefix", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index(
        "telemetry_ingest_tokens_tenant_idx",
        "telemetry_ingest_tokens",
        ["tenant_id"],
    )
    op.create_index(
        "telemetry_ingest_tokens_revoked_idx",
        "telemetry_ingest_tokens",
        ["revoked_at"],
        postgresql_where=sa.text("revoked_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_table("telemetry_ingest_tokens")
