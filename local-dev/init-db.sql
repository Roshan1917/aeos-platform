-- Single shared Postgres instance for the whole local stack.
--   • aeos   — application data, one schema per service (substrate,
--     telemetry, recommendations, test_generator, governance). Services
--     set search_path to their own schema for logical isolation.
--   • langfuse — owned by the LangFuse container (its schema, its user).
--   • openfga  — owned by the OpenFGA container (its schema, its user).
--
-- The `aeos` DB itself is created via POSTGRES_DB on the postgres image, so
-- this script only adds schemas there and provisions the LangFuse/OpenFGA
-- users + DBs.

-- ── App schemas (inside POSTGRES_DB=aeos) ────────────────────────────────
CREATE SCHEMA IF NOT EXISTS substrate;
CREATE SCHEMA IF NOT EXISTS telemetry;
CREATE SCHEMA IF NOT EXISTS recommendations;
CREATE SCHEMA IF NOT EXISTS test_generator;
CREATE SCHEMA IF NOT EXISTS discovery;
CREATE SCHEMA IF NOT EXISTS governance;

GRANT ALL PRIVILEGES ON SCHEMA substrate TO aeos;
GRANT ALL PRIVILEGES ON SCHEMA telemetry TO aeos;
GRANT ALL PRIVILEGES ON SCHEMA recommendations TO aeos;
GRANT ALL PRIVILEGES ON SCHEMA test_generator TO aeos;
GRANT ALL PRIVILEGES ON SCHEMA discovery TO aeos;
GRANT ALL PRIVILEGES ON SCHEMA governance TO aeos;

-- ── LangFuse role + DB ───────────────────────────────────────────────────
CREATE ROLE langfuse WITH LOGIN PASSWORD 'langfuse_dev_password';
CREATE DATABASE langfuse OWNER langfuse;

-- ── OpenFGA role + DB ────────────────────────────────────────────────────
CREATE ROLE openfga WITH LOGIN PASSWORD 'openfga_dev_password';
CREATE DATABASE openfga OWNER openfga;
