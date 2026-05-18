import type { Process, ProcessId, TenantId, UoPId } from '@aeos/canonical-schema';

export class ProcessRegistry {
  constructor(
    private readonly options: { tenantId: TenantId; baseUrl: string },
  ) {}

  async get(id: ProcessId): Promise<Process> {
    const response = await fetch(
      `${this.options.baseUrl}/v1/tenants/${this.options.tenantId}/processes/${id}`,
    );
    if (!response.ok) throw new Error(`Process ${id} not found: ${response.status}`);
    return response.json() as Promise<Process>;
  }

  async listByUoP(uopId: UoPId): Promise<Process[]> {
    const response = await fetch(
      `${this.options.baseUrl}/v1/tenants/${this.options.tenantId}/processes?uop_id=${uopId}`,
    );
    if (!response.ok) throw new Error(`Failed to list processes: ${response.status}`);
    return response.json() as Promise<Process[]>;
  }
}
