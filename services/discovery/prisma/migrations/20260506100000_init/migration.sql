-- CreateTable
CREATE TABLE "discovery_connectors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connector_type" TEXT NOT NULL DEFAULT 'document_only',
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "prompt_config" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error" TEXT,
    "data_summary" JSONB,
    "interaction" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_suggestions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "proposed_steps" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "process_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discovery_connectors_tenant_id_name_key" ON "discovery_connectors"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "discovery_connectors_tenant_id_idx" ON "discovery_connectors"("tenant_id");

-- CreateIndex
CREATE INDEX "discovery_runs_tenant_id_connector_id_idx" ON "discovery_runs"("tenant_id", "connector_id");

-- CreateIndex
CREATE INDEX "discovery_runs_status_idx" ON "discovery_runs"("status");

-- CreateIndex
CREATE INDEX "discovery_suggestions_tenant_id_run_id_idx" ON "discovery_suggestions"("tenant_id", "run_id");

-- CreateIndex
CREATE INDEX "discovery_suggestions_status_idx" ON "discovery_suggestions"("status");

-- AddForeignKey
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "discovery_connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_suggestions" ADD CONSTRAINT "discovery_suggestions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "discovery_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
