/**
 * Shared types for the AEOS Process Discovery service.
 */

export interface DiscoveryItem {
  category: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface DiscoveryDataset {
  source: string;
  items: DiscoveryItem[];
  fetched_at: string;
}

export interface StepAnalysisResult {
  automation_potential: number;
  recommendation: string;
}

export interface ProposedStep {
  name: string;
  step_type: 'task' | 'decision' | 'subprocess';
  description: string;
  automation_potential?: number;
  analysis_result?: StepAnalysisResult;
}

export interface ProcessSuggestion {
  name: string;
  description: string;
  steps: ProposedStep[];
}

// V1: only document_only is supported. Kept open-ended for future connectors.
export type ConnectorType = 'document_only';

export interface ConnectorDocument {
  filename: string;
  base64: string; // raw file bytes, base64-encoded
  size_bytes: number;
  media_type: string;
  extracted_text?: string; // populated for DOCX/XLSX/TXT/CSV at load time
}

export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_for_input';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'applied';
