import type { TenantId, UoP, UoPId } from '@aeos/canonical-schema';

export class UoPRegistry {
  constructor(
    private readonly options: { tenantId: TenantId; baseUrl: string },
  ) {}

  async get(id: UoPId): Promise<UoP> {
    const response = await fetch(
      `${this.options.baseUrl}/v1/tenants/${this.options.tenantId}/uops/${id}`,
    );
    if (!response.ok) throw new Error(`UoP ${id} not found: ${response.status}`);
    return response.json() as Promise<UoP>;
  }

  async list(filter?: { status?: UoP['status']; category?: UoP['category'] }): Promise<UoP[]> {
    const params = new URLSearchParams(filter as Record<string, string>);
    const response = await fetch(
      `${this.options.baseUrl}/v1/tenants/${this.options.tenantId}/uops?${params}`,
    );
    if (!response.ok) throw new Error(`Failed to list UoPs: ${response.status}`);
    return response.json() as Promise<UoP[]>;
  }

  async create(uop: Omit<UoP, 'id' | 'tenant_id' | 'created_at' | 'updated_at' | 'schema_version'>): Promise<UoP> {
    const response = await fetch(
      `${this.options.baseUrl}/v1/tenants/${this.options.tenantId}/uops`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uop),
      },
    );
    if (!response.ok) throw new Error(`Failed to create UoP: ${response.status}`);
    return response.json() as Promise<UoP>;
  }
}
