import { api } from '../api';
import { useAuthStore } from '../auth';

export type ConnectorType = 'document_only';

export interface DiscoveryConnector {
  id: string;
  tenant_id: string;
  name: string;
  connector_type: ConnectorType;
  config: Record<string, unknown>;
  status: string;
  prompt_config: unknown;
  created_at: string;
  updated_at: string;
}

export interface DocumentMeta {
  filename: string;
  original_name: string;
  media_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface InteractionMessage {
  role: 'assistant' | 'user';
  text: string;
  timestamp: string;
}

export interface InteractionState {
  history: InteractionMessage[];
  current_question: string | null;
  pending_questions?: string[];
  question_round: number;
}

export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_for_input';

export interface DiscoveryRun {
  id: string;
  tenant_id: string;
  connector_id: string;
  status: RunStatus;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  data_summary: unknown;
  interaction: InteractionState | null;
  progress: { step: string; message: string; timestamp: string } | null;
  created_at: string;
}

export interface ProposedStep {
  name: string;
  step_type: 'task' | 'decision' | 'subprocess';
  description: string;
  automation_potential?: number;
  analysis_result?: { automation_potential: number; recommendation: string };
}

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface DiscoverySuggestion {
  id: string;
  tenant_id: string;
  run_id: string;
  name: string;
  description: string | null;
  proposed_steps: ProposedStep[];
  status: SuggestionStatus;
  process_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Connectors ──────────────────────────────────────────────────────────────

export function listConnectors(): Promise<{ data: DiscoveryConnector[] }> {
  return api('discovery', '/v1/discovery/connectors');
}

export function createConnector(name: string): Promise<DiscoveryConnector> {
  return api('discovery', '/v1/discovery/connectors', {
    method: 'POST',
    body: { name, connector_type: 'document_only' },
  });
}

export function deleteConnector(id: string): Promise<void> {
  return api('discovery', `/v1/discovery/connectors/${id}`, { method: 'DELETE' });
}

// ── Documents (multipart — bypass api() helper) ────────────────────────────

export async function listDocuments(
  connectorId: string,
): Promise<{ data: DocumentMeta[] }> {
  return api('discovery', `/v1/discovery/connectors/${connectorId}/documents`);
}

export async function uploadDocument(
  connectorId: string,
  file: File,
): Promise<DocumentMeta> {
  const fd = new FormData();
  fd.append('file', file);
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(
    `/api/discovery/v1/discovery/connectors/${connectorId}/documents`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upload failed: ${res.status} ${text}`);
  }
  return (await res.json()) as DocumentMeta;
}

export function deleteDocument(connectorId: string, filename: string): Promise<void> {
  return api(
    'discovery',
    `/v1/discovery/connectors/${connectorId}/documents/${encodeURIComponent(filename)}`,
    { method: 'DELETE' },
  );
}

// ── Runs ───────────────────────────────────────────────────────────────────

export interface TriggerRunBody {
  interactive?: boolean;
  company_context?: string;
  process_depth?: 'focused' | 'broad';
  detail_level?: 'high-level' | 'moderate' | 'detailed';
}

export function triggerRun(
  connectorId: string,
  body: TriggerRunBody,
): Promise<{ id: string; status: RunStatus }> {
  return api('discovery', `/v1/discovery/connectors/${connectorId}/run`, {
    method: 'POST',
    body,
  });
}

export function getRun(runId: string): Promise<DiscoveryRun> {
  return api('discovery', `/v1/discovery/runs/${runId}`);
}

export function answerRun(
  runId: string,
  body: { answer?: string; answers?: string[] },
): Promise<{ id: string; status: string }> {
  return api('discovery', `/v1/discovery/runs/${runId}/answer`, {
    method: 'POST',
    body,
  });
}

export function skipRun(runId: string): Promise<{ id: string; status: string }> {
  return api('discovery', `/v1/discovery/runs/${runId}/skip`, { method: 'POST' });
}

// ── Suggestions ────────────────────────────────────────────────────────────

export function listSuggestions(
  runId: string,
): Promise<{ data: DiscoverySuggestion[] }> {
  return api('discovery', `/v1/discovery/runs/${runId}/suggestions`);
}

export function updateSuggestion(
  id: string,
  body: { status?: 'approved' | 'rejected' | 'pending'; proposed_steps?: ProposedStep[] },
): Promise<DiscoverySuggestion> {
  return api('discovery', `/v1/discovery/suggestions/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function applySuggestion(
  id: string,
  uopId: string,
): Promise<DiscoverySuggestion & { process: unknown }> {
  return api('discovery', `/v1/discovery/suggestions/${id}/apply`, {
    method: 'POST',
    body: { uop_id: uopId },
  });
}

export function refineSuggestion(
  id: string,
  body: {
    user_prompt: string;
    history: { role: 'user' | 'assistant'; text: string }[];
    current_steps: ProposedStep[];
  },
): Promise<{ refined_steps: ProposedStep[]; assistant_reply: string }> {
  return api('discovery', `/v1/discovery/suggestions/${id}/refine`, {
    method: 'POST',
    body,
  });
}
