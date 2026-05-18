// ---------------------------------------------------------------------------
// AEOS Adapter Binding Generator
//
// Generates TypeScript configuration snippets for a given adapter target.
// The CLI layer (sdk/cli/src/commands/generate.ts) is responsible for file I/O.
// This module only produces strings — no filesystem access here.
// ---------------------------------------------------------------------------

export type SupportedTarget =
  | 'anthropic'
  | 'openai'
  | 'bedrock'
  | 'vertex'
  | 'agentforce'
  | 'langgraph'
  | 'crewai'
  | 'human-workflow';

export interface GeneratorOptions {
  /** Target AI framework */
  readonly target: SupportedTarget;
  /** AEOS tenant identifier */
  readonly tenantId: string;
  /** AEOS agent identifier */
  readonly agentId: string;
  /** AEOS Unit-of-Performance identifier (optional) */
  readonly uopId?: string;
  /** OTLP endpoint for span export */
  readonly otlpEndpoint: string;
  /** Output path hint — used by CLI; not used in this function */
  readonly outputPath?: string;
}

export interface GeneratedAdapter {
  /** The target this was generated for */
  readonly target: SupportedTarget;
  /** TypeScript code snippet: the AdapterConfig instantiation */
  readonly configCode: string;
  /** The import statement the developer should add at the top of their file */
  readonly importStatement: string;
}

// ---------------------------------------------------------------------------
// Target metadata — package name + adapter class per target
// ---------------------------------------------------------------------------
interface TargetMeta {
  readonly packageName: string;
  readonly adapterClass: string;
}

const TARGET_META: Record<SupportedTarget, TargetMeta> = {
  anthropic: { packageName: '@aeos/sdk-adapter-anthropic', adapterClass: 'AnthropicAeosAdapter' },
  openai: { packageName: '@aeos/sdk-adapter-openai', adapterClass: 'OpenAIAdapter' },
  bedrock: { packageName: '@aeos/sdk-adapter-bedrock', adapterClass: 'BedrockAdapter' },
  vertex: { packageName: '@aeos/sdk-adapter-vertex', adapterClass: 'VertexAdapter' },
  agentforce: { packageName: '@aeos/sdk-adapter-agentforce', adapterClass: 'AgentforceAdapter' },
  langgraph: { packageName: '@aeos/sdk-adapter-langgraph', adapterClass: 'LangGraphAdapter' },
  crewai: { packageName: '@aeos/sdk-adapter-crewai', adapterClass: 'CrewAIAdapter' },
  'human-workflow': { packageName: '@aeos/sdk-adapter-human-workflow', adapterClass: 'HumanWorkflowAdapter' },
};

// ---------------------------------------------------------------------------
// generateAdapter
//
// Returns a configCode snippet (paste into your service) and an importStatement
// (paste at the top of your file).  No file I/O performed.
// ---------------------------------------------------------------------------
export function generateAdapter(options: GeneratorOptions): GeneratedAdapter {
  const meta = TARGET_META[options.target];

  const importStatement = `import { ${meta.adapterClass} } from '${meta.packageName}';`;

  const uopLine = options.uopId !== undefined
    ? `\n  uopId: '${options.uopId}',`
    : '';

  const configCode = [
    `const aeosAdapter = new ${meta.adapterClass}({`,
    `  tenantId: '${options.tenantId}',`,
    `  agentId: '${options.agentId}',${uopLine}`,
    `  otlpEndpoint: '${options.otlpEndpoint}',`,
    `});`,
  ].join('\n');

  return {
    target: options.target,
    configCode,
    importStatement,
  };
}
