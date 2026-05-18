# @aeos/registry-client

Clients for the three AEOS semantic registries: UoP, Process, Agent.

## Write permissions

Only specific services may write to each registry:
- **UoP registry** — Assessment service only
- **Process registry** — Process Discovery service only
- **Agent registry** — Substrate (Auth) service + Telemetry (for auto-registration via SDK adapters)

All other services are **read-only** consumers.

## Usage

```typescript
import { UoPRegistry, ProcessRegistry, AgentRegistry } from '@aeos/registry-client';

const registryUrl = process.env.REGISTRY_URL;

const uopRegistry = new UoPRegistry({ tenantId, baseUrl: registryUrl });
const processRegistry = new ProcessRegistry({ tenantId, baseUrl: registryUrl });
const agentRegistry = new AgentRegistry({ tenantId, baseUrl: registryUrl });

const uop = await uopRegistry.get(uopId);
const processes = await processRegistry.listByUoP(uopId);
const agent = await agentRegistry.get(agentId);
```

## Required env vars

| Var | Description |
|---|---|
| `REGISTRY_URL` | Base URL of the substrate Registry service |
