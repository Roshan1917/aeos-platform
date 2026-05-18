-- TenantSettings.agentDeploymentPlatform
ALTER TABLE "tenant_settings"
  ADD COLUMN "agent_deployment_platform" JSONB;

-- Per-process-step agent specifications. Created during Process Discovery as
-- the user fills in the agent for an agent-type step; exported as JSON for
-- the customer to instantiate in their own agent harness. The harness emits
-- telemetry back to AEOS which is what registers the Agent entity.
CREATE TABLE "agent_step_specs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "process_id" TEXT NOT NULL,
  "step_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "vendor_runtime" TEXT NOT NULL,
  "model_provider" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "framework" TEXT,
  "system_prompt" TEXT NOT NULL,
  "user_prompt_template" TEXT,
  "temperature" DOUBLE PRECISION,
  "max_tokens" INTEGER,
  "tools" JSONB,
  "input_schema" JSONB,
  "output_schema" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_step_specs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_step_specs_process_id_step_id_key"
  ON "agent_step_specs"("process_id", "step_id");
CREATE INDEX "agent_step_specs_tenant_id_idx"
  ON "agent_step_specs"("tenant_id");

ALTER TABLE "agent_step_specs"
  ADD CONSTRAINT "agent_step_specs_process_id_fkey"
  FOREIGN KEY ("process_id") REFERENCES "processes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
