-- CreateTable
CREATE TABLE "test_cases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "agent_hint" TEXT NOT NULL DEFAULT '',
    "uop_hint" TEXT NOT NULL DEFAULT '',
    "plan_json" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_cases_tenant_id_idx" ON "test_cases"("tenant_id");
