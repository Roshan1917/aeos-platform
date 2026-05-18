import type { Agent, AgentId, TenantId } from '@aeos/canonical-schema';

export class AgentRegistry {
  constructor(
    private readonly options: { tenantId: TenantId; baseUrl: string },
  ) {}

  async get(id: AgentId): Promise<Agent> {
    const response = await fetch(
      `${this.options.baseUrl}/v1/tenants/${this.options.tenantId}/agents/${id}`,
    );
    if (!response.ok) throw new Error(`Agent ${id} not found: ${response.status}`);
    return response.json() as Promise<Agent>;
  }

  async list(filter?: { status?: Agent['status'] }): Promise<Agent[]> {
    const params = new URLSearchParams(filter as Record<string, string>);
    const response = await fetch(
      `${this.options.baseUrl}/v1/tenants/${this.options.tenantId}/agents?${params}`,
    );
    if (!response.ok) throw new Error(`Failed to list agents: ${response.status}`);
    return response.json() as Promise<Agent[]>;
  }
}
