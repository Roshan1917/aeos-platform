"""create spans table

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
        "spans",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("span_id", sa.Text(), nullable=False),
        sa.Column("trace_id", sa.Text(), nullable=False),
        sa.Column("parent_span_id", sa.Text(), nullable=True),
        sa.Column("agent_id", sa.Text(), nullable=False),
        sa.Column("uop_id", sa.Text(), nullable=True),
        sa.Column("process_id", sa.Text(), nullable=True),
        sa.Column("decision_id", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("start_time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("end_time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("duration_ms", sa.Float(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="unset"),
        sa.Column("attributes", sa.dialects.postgresql.JSONB(),
                  nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("events", sa.dialects.postgresql.JSONB(),
                  nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("enrichment_version", sa.Text(), nullable=False),
        sa.Column("ingested_at", sa.TIMESTAMP(timezone=True),
                  nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_index(
        "spans_tenant_span_uidx", "spans", ["tenant_id", "span_id"], unique=True
    )
    op.create_index("spans_tenant_trace_idx", "spans", ["tenant_id", "trace_id"])
    op.create_index("spans_tenant_agent_idx", "spans", ["tenant_id", "agent_id"])
    op.create_index(
        "spans_tenant_uop_idx",
        "spans",
        ["tenant_id", "uop_id"],
        postgresql_where=sa.text("uop_id IS NOT NULL"),
    )
    op.execute(
        "CREATE INDEX spans_tenant_kind_start_idx ON spans (tenant_id, kind, start_time DESC)"
    )


def downgrade() -> None:
    op.drop_table("spans")
