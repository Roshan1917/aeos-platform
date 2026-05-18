/**
 * Thin client for substrate's process registry endpoint.
 * Forwards the caller's JWT — substrate enforces tenant+admin gating itself.
 */
import { config } from '../config.js';
import type { ProposedStep } from '../types.js';

interface CreateProcessRequest {
  uop_id: string;
  name: string;
  description: string;
  steps: Array<{
    step_id: string;
    name: string;
    type: 'human' | 'agent' | 'automated' | 'decision';
    responsible_agent_id?: string;
    inputs: string[];
    outputs: string[];
    next_steps: string[];
  }>;
}

export interface SubstrateProcess {
  id: string;
  tenant_id: string;
  uop_id: string;
  name: string;
  description: string;
  steps: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProcessOptions {
  tenantId: string;
  authorization: string; // raw header value, "Bearer <token>"
  uopId: string;
  name: string;
  description: string | null;
  proposedSteps: ProposedStep[];
}

/** Translate ProposedStep[] into the canonical ProcessStep[] shape substrate expects. */
function mapSteps(steps: ProposedStep[]): CreateProcessRequest['steps'] {
  return steps.map((s, i) => {
    const stepId = `step-${i + 1}`;
    const next = i < steps.length - 1 ? [`step-${i + 2}`] : [];
    return {
      step_id: stepId,
      name: s.name,
      type: s.step_type === 'decision' ? 'decision' : 'human',
      inputs: [],
      outputs: [],
      next_steps: next,
    };
  });
}

export async function createProcessOnSubstrate(
  opts: CreateProcessOptions,
): Promise<SubstrateProcess> {
  const body: CreateProcessRequest = {
    uop_id: opts.uopId,
    name: opts.name,
    description: opts.description ?? '',
    steps: mapSteps(opts.proposedSteps),
  };

  const url = `${config.SUBSTRATE_URL}/v1/tenants/${encodeURIComponent(opts.tenantId)}/processes`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: opts.authorization,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`substrate POST /processes failed: ${res.status} ${text}`);
  }

  return (await res.json()) as SubstrateProcess;
}
