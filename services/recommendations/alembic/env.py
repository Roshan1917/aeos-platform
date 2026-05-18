from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.config import config as service_config  # noqa: E402

config = context.config

db_url = service_config.DATABASE_URL
if db_url.startswith("postgresql+asyncpg://"):
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
# Alembic stores the URL via ConfigParser; `%` in passwords (URL-encoded
# specials like `%23`, `%25`) is read as an interpolation token. Doubling
# each `%` makes ConfigParser emit a literal one.
config.set_main_option("sqlalchemy.url", db_url.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None

db_schema = service_config.DATABASE_SCHEMA


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema=db_schema,
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    from sqlalchemy import text

    connectable = engine_from_config(
        config.get_section(config.config_ini_section) or {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{db_schema}"'))
        connection.execute(text(f'SET search_path TO "{db_schema}"'))
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema=db_schema,
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
