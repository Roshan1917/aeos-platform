import type { AgentContractId } from '@aeos/canonical-schema';

export interface AgentIdentityVerification {
  readonly valid: boolean;
  readonly agentId?: string;
  readonly uopId?: string;
}

export async function verifyAgentContract(
  contractId: AgentContractId,
  agentId: string,
): Promise<AgentIdentityVerification> {
  const authServiceUrl = process.env['AUTH_SERVICE_URL'];
  if (!authServiceUrl) {
    throw new Error('AUTH_SERVICE_URL not configured');
  }

  const response = await fetch(`${authServiceUrl}/v1/agent-contracts/${contractId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId }),
  });

  if (!response.ok) {
    return { valid: false };
  }

  const body = (await response.json()) as {
    valid: boolean;
    agent_id?: string;
    uop_id?: string;
  };
  return {
    valid: body.valid,
    agentId: body.agent_id,
    uopId: body.uop_id,
  };
}
