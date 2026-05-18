"""create recommendations table

Revision ID: 0001
Revises:
Create Date: 2026-04-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    op.create_table(
        "recommendations",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("uop_id", sa.Text(), nullable=False),
        sa.Column("agent_id", sa.Text(), nullable=True),
        sa.Column("template_id", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("priority", sa.Text(), nullable=False),
        sa.Column("estimated_impact_value", sa.Float(), nullable=True),
        sa.Column("estimated_impact_currency", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="open"),
        sa.Column(
            "evidence_row_ids",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False),
    )

    op.create_index(
        "recommendations_tenant_status_idx",
        "recommendations",
        ["tenant_id", "status"],
    )
    op.create_index(
        "recommendations_tenant_uop_idx",
        "recommendations",
        ["tenant_id", "uop_id"],
    )
    op.create_index(
        "recommendations_tenant_agent_idx",
        "recommendations",
        ["tenant_id", "agent_id"],
        postgresql_where=sa.text("agent_id IS NOT NULL"),
    )
    op.create_index(
        "recommendations_tenant_priority_idx",
        "recommendations",
        ["tenant_id", "priority", "created_at"],
    )

    # Partial unique index — at most one open recommendation per
    # (tenant, template, agent, uop). Closed/dismissed/adopted recs are
    # exempt so the same template can fire again later.
    op.execute(
        """
        CREATE UNIQUE INDEX recommendations_open_dedup_uidx
        ON recommendations (tenant_id, template_id, COALESCE(agent_id, ''), uop_id)
        WHERE status = 'open'
        """
    )


def downgrade() -> None:
    op.drop_table("recommendations")
