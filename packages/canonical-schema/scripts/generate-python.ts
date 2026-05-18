#!/usr/bin/env tsx
/**
 * generate-python.ts
 *
 * Auto-generates src/python/aeos_canonical_schema/types.py from TypeScript source.
 * Pipeline: TypeScript → JSON Schema (ts-json-schema-generator) → Python (custom emitter)
 *
 * Run: pnpm --filter @aeos/canonical-schema build:python
 */

import { createGenerator } from 'ts-json-schema-generator';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = resolve(PACKAGE_ROOT, 'src/python/aeos_canonical_schema/types.py');
const TYPES_ENTRY = resolve(PACKAGE_ROOT, 'src/types/index.ts');
const TSCONFIG = resolve(PACKAGE_ROOT, 'tsconfig.json');

// ── Explicit type list ────────────────────────────────────────────────────────
// ts-json-schema-generator omits interfaces that reference branded types when
// using `type: '*'`, so we list every type we want to generate explicitly.

const TYPES_TO_GENERATE: string[] = [
  // tenant.ts
  'Tenant',
  'TenantSettings',
  'ComplianceFramework',
  // uop.ts
  'UoP',
  'UoPCategory',
  'SystemOfRecord',
  // process.ts
  'Process',
  'ProcessStep',
  // agent.ts
  'Agent',
  'VendorRuntime',
  'ModelProvider',
  'AgentFramework',
  // agent-contract.ts
  'AgentContract',
  'UefWeights',
  // boundary.ts
  'Boundary',
  'BoundaryType',
  'BoundaryScope',
  'BoundaryDefinition',
  // span.ts
  'AeosSpan',
  'SpanKind',
  'SpanStatus',
  'SpanAttributes',
  'SpanEvent',
  // ledger-row.ts
  'UefScore',
  'LedgerRow',
  'LedgerRowType',
  'PredictedPayload',
  'ActualPayload',
  'VarianceBucket',
  'VariancePayload',
  'AttributionFactor',
  'AttributionPayload',
  'CorrectionPayload',
  // recommendation.ts
  'Recommendation',
  'RecommendationCategory',
  // attestation.ts
  'AttestationBundle',
  'ComplianceReadinessScore',
];

// ── Patent annotations ────────────────────────────────────────────────────────

const PATENT_COMMENTS: Record<string, string> = {
  UoP: 'PATENT: Family 1 — do not modify without CTO approval (danny.goldstein@fuzebox.ai)',
  Agent: 'PATENT: Family 1 — do not modify without CTO approval',
  AgentContract: 'PATENT: Family 1 — do not modify without CTO approval',
  UefWeights: 'PATENT: Family 1',
  Boundary: 'PATENT: Family 3 — do not modify without CTO approval',
  BoundaryDefinition: 'PATENT: Family 3',
  LedgerRow:
    'PATENT: Families 2 & 8 (USPTO #63/898,712) — APPEND-ONLY — do not modify without CTO approval',
  UefScore: 'PATENT: Families 2 & 8',
  PredictedPayload: 'PATENT: Families 2 & 8',
  ActualPayload: 'PATENT: Families 2 & 8',
  VariancePayload: 'PATENT: Families 2 & 8',
  AttributionPayload: 'PATENT: Families 2 & 8',
  AttributionFactor: 'PATENT: Families 2 & 8',
  CorrectionPayload: 'PATENT: Families 2 & 8',
  AttestationBundle: 'PATENT: Family 8 — do not modify without CTO approval',
  ComplianceReadinessScore: 'PATENT: Family 8',
};

// Types with open additional properties (index signatures)
const EXTRA_ALLOW = new Set(['SpanAttributes']);

// ── Schema helpers ────────────────────────────────────────────────────────────

type JsonSchema = Record<string, unknown>;

function refName(ref: string): string {
  return ref.replace(/^#\/definitions\//, '');
}

function camelToSnake(str: string): string {
  return str
    .replace(/\./g, '_') // "aeos.vendor_runtime" → "aeos_vendor_runtime"
    // Use the third callback arg (offset) — NOT the capture group — to decide underscoring
    .replace(/([A-Z])/g, (_match, _p1, offset: number) =>
      offset > 0 ? '_' + _match.toLowerCase() : _match.toLowerCase(),
    );
}

/** True if schema represents a string enum (named or inline). */
function isStringEnum(schema: JsonSchema): boolean {
  // ts-json-schema-generator uses { type: "string", enum: [...] } for string unions
  if (schema.type === 'string' && Array.isArray(schema.enum)) return true;
  // Some versions use anyOf/oneOf with const
  const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  if (!variants) return false;
  return variants.every(
    (v) =>
      (v.type === 'string' && Array.isArray(v.enum) && (v.enum as unknown[]).length === 1) ||
      v.const !== undefined,
  );
}

function getEnumValues(schema: JsonSchema): string[] {
  if (schema.type === 'string' && Array.isArray(schema.enum)) {
    return schema.enum as string[];
  }
  const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[];
  return variants.map((v) =>
    v.const !== undefined ? String(v.const) : String((v.enum as unknown[])[0]),
  );
}

/** Convert a JSON Schema property schema to a Python type string. */
function schemaToType(schema: JsonSchema, defs: Record<string, JsonSchema>): string {
  if (!schema || typeof schema !== 'object') return 'Any';

  // $ref — resolve, skipping Record<T> utility types to dict[str, T]
  if (typeof schema.$ref === 'string') {
    // ts-json-schema-generator may URL-encode angle brackets in ref names
    const name = decodeURIComponent(refName(schema.$ref));
    if (name.startsWith('Record<')) {
      // Resolve the definition to dict[str, T]
      // The key in defs may be URL-encoded, so try both forms
      const def = defs[name] ?? defs[encodeURIComponent(name)];
      if (def) {
        const addl = def.additionalProperties as JsonSchema | boolean | undefined;
        if (addl && typeof addl === 'object') {
          return `dict[str, ${schemaToType(addl, defs)}]`;
        }
        const props = def.properties as Record<string, JsonSchema> | undefined;
        if (props) {
          const valueTypes = [...new Set(Object.values(props).map((p) => schemaToType(p, defs)))];
          return `dict[str, ${valueTypes.length === 1 ? valueTypes[0] : `Union[${valueTypes.join(', ')}]`}]`;
        }
      }
      return 'dict[str, Any]';
    }
    // Branded ID types → plain str
    if (name.endsWith('Id') && (defs[name] as JsonSchema | undefined)?.type === 'string') {
      return 'str';
    }
    return name;
  }

  // allOf: intersection / branded type wrapper → unwrap to first meaningful part
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf as JsonSchema[];
    // Merge all object parts
    const objectPart = parts.find((p) => p.type === 'object' || p.properties) ?? parts[0];
    return schemaToType(objectPart, defs);
  }

  // const (e.g. schema_version field)
  if (schema.const !== undefined) return `Literal[${JSON.stringify(schema.const)}]`;

  // enum (ts-json-schema-generator's format for string literal unions)
  if (Array.isArray(schema.enum)) {
    if (schema.enum.length === 1) return `Literal[${JSON.stringify(schema.enum[0])}]`;
    return `Literal[${(schema.enum as unknown[]).map((v) => JSON.stringify(v)).join(', ')}]`;
  }

  // anyOf / oneOf
  const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  if (variants) {
    const nonNull = variants.filter((v) => !(v.type === 'null' && !v.$ref && !v.anyOf));
    const hasNull = variants.length > nonNull.length;

    if (isStringEnum(schema)) {
      const vals = getEnumValues(schema);
      const lit = `Literal[${vals.map((v) => JSON.stringify(v)).join(', ')}]`;
      return hasNull ? `Optional[${lit}]` : lit;
    }

    // Discriminated union: all refs share a `type` const discriminator
    const refs = nonNull.filter((v) => v.$ref).map((v) => refName(v.$ref as string));
    if (refs.length === nonNull.length && refs.length > 1) {
      const isDiscriminated = refs.every((r) => {
        const def = defs[r];
        if (!def) return false;
        const props = def.properties as Record<string, JsonSchema> | undefined;
        return props?.type?.const !== undefined || Array.isArray(props?.type?.enum);
      });
      const union = `Union[${refs.join(', ')}]`;
      const inner = isDiscriminated
        ? `Annotated[\n        ${union},\n        Field(discriminator="type"),\n    ]`
        : union;
      return hasNull ? `Optional[${inner}]` : inner;
    }

    const pyTypes = nonNull.map((v) => schemaToType(v, defs));
    const unique = [...new Set(pyTypes)];
    const union = unique.length === 1 ? unique[0] : `Union[${unique.join(', ')}]`;
    return hasNull ? `Optional[${union}]` : union;
  }

  switch (schema.type) {
    case 'string': return 'str';
    case 'number': return 'float';
    case 'integer': return 'int';
    case 'boolean': return 'bool';
    case 'null': return 'None';
    case 'array': {
      const items = schema.items as JsonSchema | undefined;
      return `list[${items ? schemaToType(items, defs) : 'Any'}]`;
    }
    case 'object': {
      const addl = schema.additionalProperties as JsonSchema | boolean | undefined;
      if (addl && typeof addl === 'object') {
        return `dict[str, ${schemaToType(addl, defs)}]`;
      }
      return 'dict[str, Any]';
    }
    default:
      if (schema.properties) return 'dict[str, Any]';
      return 'Any';
  }
}

// ── Emitters ──────────────────────────────────────────────────────────────────

function emitEnum(name: string, values: string[]): string {
  const lines = [`class ${name}(str, Enum):`];
  for (const v of values) {
    const key = v
      .toUpperCase()
      .replace(/[-. ]/g, '_')
      .replace(/[^A-Z0-9_]/g, '');
    lines.push(`    ${key} = ${JSON.stringify(v)}`);
  }
  return lines.join('\n');
}

function emitModel(name: string, schema: JsonSchema, defs: Record<string, JsonSchema>): string {
  const lines: string[] = [];

  const patent = PATENT_COMMENTS[name];
  if (patent) lines.push(`# ${patent}`);

  lines.push(`class ${name}(BaseModel):`);

  const configParts = ['"frozen": True'];
  if (EXTRA_ALLOW.has(name)) configParts.push('"extra": "allow"');
  lines.push(`    model_config = {${configParts.join(', ')}}`);

  const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set<string>((schema.required ?? []) as string[]);
  const propKeys = Object.keys(props);

  if (propKeys.length === 0) {
    lines.push('    pass');
    return lines.join('\n');
  }

  for (const propName of propKeys) {
    const propSchema = props[propName];
    const snakeName = camelToSnake(propName);
    const isOptional = !required.has(propName);
    const needsAlias = propName.includes('.');

    // const field (schema_version) → Literal with default
    if (propSchema.const !== undefined) {
      const litType = `Literal[${JSON.stringify(propSchema.const)}]`;
      lines.push(`    ${snakeName}: ${litType} = ${JSON.stringify(propSchema.const)}`);
      continue;
    }
    // enum-only const (schema_version via typeof)
    if (
      propSchema.type === 'string' &&
      Array.isArray(propSchema.enum) &&
      (propSchema.enum as unknown[]).length === 1
    ) {
      const val = (propSchema.enum as string[])[0];
      lines.push(`    ${snakeName}: Literal[${JSON.stringify(val)}] = ${JSON.stringify(val)}`);
      continue;
    }

    const pyType = schemaToType(propSchema, defs);

    if (needsAlias) {
      const aliasStr = JSON.stringify(propName);
      if (isOptional) {
        lines.push(`    ${snakeName}: Optional[${pyType}] = Field(None, alias=${aliasStr})`);
      } else {
        lines.push(`    ${snakeName}: ${pyType} = Field(..., alias=${aliasStr})`);
      }
    } else if (isOptional) {
      lines.push(`    ${snakeName}: Optional[${pyType}] = None`);
    } else {
      lines.push(`    ${snakeName}: ${pyType}`);
    }
  }

  return lines.join('\n');
}

// ── Topological sort ──────────────────────────────────────────────────────────

function getDeps(schema: JsonSchema, defs: Record<string, JsonSchema>): string[] {
  const deps: string[] = [];
  const walk = (s: unknown) => {
    if (!s || typeof s !== 'object') return;
    const obj = s as Record<string, unknown>;
    if (typeof obj.$ref === 'string') {
      const name = refName(obj.$ref);
      if (defs[name] && TYPES_TO_GENERATE.includes(name)) deps.push(name);
    }
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) val.forEach(walk);
      else if (val && typeof val === 'object') walk(val);
    }
  };
  walk(schema);
  return [...new Set(deps)];
}

function topoSort(
  types: string[],
  schemas: Record<string, JsonSchema>,
  defs: Record<string, JsonSchema>,
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  const visit = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);
    for (const dep of getDeps(schemas[name] ?? {}, defs)) {
      visit(dep);
    }
    result.push(name);
  };

  for (const name of types) visit(name);
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('[generate-python] Generating schemas from TypeScript types...');

  const generator = createGenerator({
    path: TYPES_ENTRY,
    tsconfig: TSCONFIG,
    type: '*',
    skipTypeCheck: false,
    expose: 'all',
    topRef: false,
    jsDoc: 'none',
    additionalProperties: false,
  });

  // Collect all definitions by generating schemas for each target type individually
  const allDefs: Record<string, JsonSchema> = {};
  const typeSchemas: Record<string, JsonSchema> = {};

  for (const typeName of TYPES_TO_GENERATE) {
    let schema: ReturnType<typeof generator.createSchema> | undefined;
    try {
      schema = generator.createSchema(typeName);
    } catch (err) {
      console.error(`[generate-python] Failed to generate schema for ${typeName}:`, err);
      process.exit(1);
    }

    // Merge definitions
    const defs = (schema.definitions ?? {}) as Record<string, JsonSchema>;
    Object.assign(allDefs, defs);

    // The main schema (top-level) IS the type's definition
    const mainSchema: JsonSchema = { ...schema };
    delete mainSchema.$schema;
    delete mainSchema.definitions;
    typeSchemas[typeName] = mainSchema;
    allDefs[typeName] = mainSchema; // ensure type itself is in defs for ref resolution
  }

  console.log(`[generate-python] Collected ${Object.keys(allDefs).length} definitions.`);

  // Sort types in dependency order
  const sortedTypes = topoSort(TYPES_TO_GENERATE, typeSchemas, allDefs);

  const sections: string[] = [];

  for (const name of sortedTypes) {
    const def = typeSchemas[name];
    if (!def) {
      console.warn(`[generate-python] No schema for ${name} — skipping`);
      continue;
    }

    if (isStringEnum(def)) {
      sections.push(emitEnum(name, getEnumValues(def)));
    } else if (def.type === 'object' || def.properties) {
      sections.push(emitModel(name, def, allDefs));
    } else if (Array.isArray(def.allOf)) {
      // allOf-wrapped interface (some TypeScript patterns) — merge and emit
      const merged: JsonSchema = {};
      for (const part of def.allOf as JsonSchema[]) {
        const resolved: JsonSchema =
          typeof part.$ref === 'string'
            ? (allDefs[refName(part.$ref)] ?? {})
            : (part as JsonSchema);
        if (resolved.type) merged.type = resolved.type;
        if (resolved.properties) {
          merged.properties = {
            ...((merged.properties as object) ?? {}),
            ...(resolved.properties as object),
          };
        }
        if (resolved.required) {
          merged.required = [
            ...((merged.required as string[]) ?? []),
            ...(resolved.required as string[]),
          ];
        }
      }
      if (merged.type === 'object' || merged.properties) {
        sections.push(emitModel(name, merged, allDefs));
      } else {
        console.warn(`[generate-python] Could not resolve allOf for ${name}`);
      }
    } else {
      console.warn(`[generate-python] Unsupported schema pattern for ${name} — skipping`);
    }
  }

  const fileContent = [
    '# AUTO-GENERATED from TypeScript source. Do not edit manually.',
    '# Regenerate: pnpm --filter @aeos/canonical-schema build:python',
    '# Source of truth: packages/canonical-schema/src/types/',
    '# PATENT-ADJACENT types are annotated below — do not modify without CTO approval.',
    '',
    'from __future__ import annotations',
    '',
    'from enum import Enum',
    'from typing import Annotated, Any, Literal, Optional, Union',
    'from pydantic import BaseModel, Field',
    '',
    '',
    sections.join('\n\n\n'),
    '',
  ].join('\n');

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, fileContent, 'utf8');
  console.log(`[generate-python] Written: ${OUTPUT_PATH}`);
  console.log(`[generate-python] ${sortedTypes.length} types generated.`);
}

main();
