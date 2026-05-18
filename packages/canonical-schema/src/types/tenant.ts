export type TenantId = string & { readonly _brand: 'TenantId' };

export function tenantId(id: string): TenantId {
  return id as TenantId;
}

export interface Tenant {
  readonly id: TenantId;
  readonly name: string;
  readonly slug: string;
  readonly deploymentMode: 'pooled' | 'siloed' | 'on-prem';
  readonly status: 'active' | 'suspended' | 'offboarded';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TenantSettings {
  readonly tenantId: TenantId;
  readonly anonymizedBenchmarksConsent: boolean;
  readonly dataRetentionDays: number;
  readonly complianceFrameworks: ComplianceFramework[];
  readonly agentDeploymentPlatform: AgentDeploymentPlatform | null;
}

export type AgentDeploymentPlatformKind =
  | 'aws_bedrock'
  | 'anthropic_cloud'
  | 'azure_openai'
  | 'google_vertex'
  | 'custom';

export interface AgentDeploymentPlatform {
  readonly kind: AgentDeploymentPlatformKind;
  readonly config_complete: boolean;
}

export type ComplianceFramework = 'EU_AI_ACT' | 'ISO_42001' | 'UNECE_WP29' | 'MAS_TRM' | 'SOC2';
