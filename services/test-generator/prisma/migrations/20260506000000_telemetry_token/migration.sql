-- CreateTable
CREATE TABLE "tenant_telemetry_tokens" (
    "tenant_id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_telemetry_tokens_pkey" PRIMARY KEY ("tenant_id")
);
