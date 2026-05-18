import { randomUUID } from 'crypto';
import type {
  Agent,
  AgentId,
  Process,
  ProcessId,
  TenantId,
  UoP,
  UoPId,
} from '@aeos/canonical-schema';
import { tenantId as makeTenantId, uoPId } from '@aeos/canonical-schema';
import { makeAgent, makeUoP } from '../fixtures/index.js';

// ---------------------------------------------------------------------------
// Mock UoP Registry
// ---------------------------------------------------------------------------

export class MockUoPRegistry {
  private readonly store = new Map<UoPId, UoP>();
  readonly tenantId: TenantId;

  constructor(options: { tenantId: TenantId; baseUrl?: string }) {
    this.tenantId = options.tenantId;
  }

  /** Pre-seed the registry with known UoPs for a test. */
  seed(uops: UoP[]): this {
    for (const uop of uops) {
      this.store.set(uop.id, uop);
    }
    return this;
  }

  async get(id: UoPId): Promise<UoP> {
    const uop = this.store.get(id);
    if (!uop) throw new Error(`UoP ${id} not found`);
    return Promise.resolve(uop);
  }

  async list(filter?: { status?: UoP['status']; category?: UoP['category'] }): Promise<UoP[]> {
    let results = Array.from(this.store.values()).filter(
      (u) => u.tenant_id === this.tenantId,
    );
    if (filter?.status) results = results.filter((u) => u.status === filter.status);
    if (filter?.category) results = results.filter((u) => u.category === filter.category);
    return Promise.resolve(results);
  }

  async create(
    data: Omit<UoP, 'id' | 'tenant_id' | 'created_at' | 'updated_at' | 'schema_version'>,
  ): Promise<UoP> {
    const now = new Date().toISOString();
    const uop: UoP = {
      schema_version: '1.0',
      id: uoPId(randomUUID()),
      tenant_id: this.tenantId,
      created_at: now,
      updated_at: now,
      ...data,
    };
    this.store.set(uop.id, uop);
    return Promise.resolve(uop);
  }

  /** Clear all stored UoPs. */
  reset(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Mock Process Registry
// ---------------------------------------------------------------------------

export class MockProcessRegistry {
  private readonly store = new Map<ProcessId, Process>();
  readonly tenantId: TenantId;

  constructor(options: { tenantId: TenantId; baseUrl?: string }) {
    this.tenantId = options.tenantId;
  }

  seed(processes: Process[]): this {
    for (const p of processes) {
      this.store.set(p.id, p);
    }
    return this;
  }

  async get(id: ProcessId): Promise<Process> {
    const process = this.store.get(id);
    if (!process) throw new Error(`Process ${id} not found`);
    return Promise.resolve(process);
  }

  async listByUoP(uopId: UoPId): Promise<Process[]> {
    const results = Array.from(this.store.values()).filter(
      (p) => p.tenant_id === this.tenantId && p.uop_id === uopId,
    );
    return Promise.resolve(results);
  }

  reset(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Mock Agent Registry
// ---------------------------------------------------------------------------

export class MockAgentRegistry {
  private readonly store = new Map<AgentId, Agent>();
  readonly tenantId: TenantId;

  constructor(options: { tenantId: TenantId; baseUrl?: string }) {
    this.tenantId = options.tenantId;
  }

  seed(agents: Agent[]): this {
    for (const a of agents) {
      this.store.set(a.id, a);
    }
    return this;
  }

  async get(id: AgentId): Promise<Agent> {
    const agent = this.store.get(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    return Promise.resolve(agent);
  }

  async list(filter?: { status?: Agent['status'] }): Promise<Agent[]> {
    let results = Array.from(this.store.values()).filter(
      (a) => a.tenant_id === this.tenantId,
    );
    if (filter?.status) results = results.filter((a) => a.status === filter.status);
    return Promise.resolve(results);
  }

  reset(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Convenience factory — returns pre-seeded mocks ready to use in tests
// ---------------------------------------------------------------------------

export interface SeedOptions {
  tenantId?: TenantId;
  uopCount?: number;
  agentCount?: number;
}

export interface SeededRegistries {
  tenantId: TenantId;
  uopRegistry: MockUoPRegistry;
  processRegistry: MockProcessRegistry;
  agentRegistry: MockAgentRegistry;
  uops: UoP[];
  agents: Agent[];
}

export function createSeededRegistries(options: SeedOptions = {}): SeededRegistries {
  const tid = options.tenantId ?? makeTenantId('test-tenant');
  const uopCount = options.uopCount ?? 2;
  const agentCount = options.agentCount ?? 2;

  const uops = Array.from({ length: uopCount }, () => makeUoP(tid));
  const agents = Array.from({ length: agentCount }, () => makeAgent(tid));

  const uopRegistry = new MockUoPRegistry({ tenantId: tid }).seed(uops);
  const processRegistry = new MockProcessRegistry({ tenantId: tid });
  const agentRegistry = new MockAgentRegistry({ tenantId: tid }).seed(agents);

  return { tenantId: tid, uopRegistry, processRegistry, agentRegistry, uops, agents };
}
