# UoP JSON Import / Export

Operators can move a tenant's Units of Potential between environments by exporting them to JSON and re-importing into another tenant.

> **Patent note:** UoP is patent-adjacent (Family 1). The bundle format only serializes existing canonical-schema fields; do not extend it without CTO approval.

## Bundle format

```json
{
  "format": "aeos.uop.bundle",
  "format_version": "1.0",
  "exported_at": "2026-05-08T14:00:00Z",
  "source_tenant_id": "tenant_abc",
  "items": [
    {
      "name": "Qualify Inbound Lead",
      "description": "Score and route inbound leads",
      "category": "revenue_generation",
      "system_of_record": "salesforce",
      "sor_object_type": "Lead",
      "sor_metric_field": "ConvertedOpportunityAmount",
      "baseline_value": 50000,
      "baseline_currency": "USD",
      "owner_team": "sales"
    }
  ]
}
```

Fields per item match the `createUoPSchema` Zod validator in [services/substrate/src/api/registry.ts](../../services/substrate/src/api/registry.ts). Server-generated fields (`id`, `tenant_id`, `created_at`, `updated_at`, `schema_version`, `status`) are emitted on export and tolerated-but-ignored on import.

`category` ∈ `revenue_generation | cost_reduction | risk_mitigation | compliance | customer_experience | operational_efficiency`.

`system_of_record` ∈ `salesforce | sap | hubspot | oracle | workday | servicenow | custom`.

## Export

From the web app: `/uops` → **Export JSON** → downloads `aeos-uops-<tenant>-<YYYYMMDD>.json`. Pure client-side; reuses the already-fetched UoP list.

## Import

From the web app: `/uops` → **Import JSON** → pick a bundle file. Requires `admin` or `platform_admin` role. Bundle items with names that already exist in the tenant are **skipped** (not updated).

Or via curl:

```bash
curl -X POST "https://staging.aeos.fuzebox.ai/api/substrate/v1/tenants/$TID/uops/import" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d @bundle.json | jq .
```

### Response

```json
{
  "summary": { "total": 12, "created": 10, "skipped": 2, "errors": 0 },
  "results": [
    { "index": 0, "status": "created", "id": "uop_..." },
    { "index": 1, "status": "skipped", "reason": "duplicate_name" },
    { "index": 2, "status": "error", "error": "invalid_item", "details": {} }
  ]
}
```

HTTP 200 whenever the envelope parses (even if individual items fail). HTTP 400 only when the envelope itself is malformed. Limits: 1–500 items per request.

### Side effects

Each newly created UoP emits one `registry.uop.registered` event on the tenant's Kafka topic — same event shape as the single-item POST.
