import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applySuggestion,
  answerRun,
  createConnector,
  deleteConnector,
  deleteDocument,
  getRun,
  listConnectors,
  listDocuments,
  listSuggestions,
  refineSuggestion,
  skipRun,
  triggerRun,
  updateSuggestion,
  uploadDocument,
  type ProposedStep,
  type TriggerRunBody,
} from '../lib/clients/discovery';

export function useConnectors() {
  return useQuery({
    queryKey: ['discovery-connectors'],
    queryFn: () => listConnectors().then((r) => r.data),
  });
}

export function useCreateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createConnector(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discovery-connectors'] }),
  });
}

export function useDeleteConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConnector(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discovery-connectors'] }),
  });
}

export function useDocuments(connectorId: string | undefined) {
  return useQuery({
    queryKey: ['discovery-documents', connectorId],
    queryFn: () => listDocuments(connectorId!).then((r) => r.data),
    enabled: !!connectorId,
  });
}

export function useUploadDocument(connectorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadDocument(connectorId!, file),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['discovery-documents', connectorId] }),
  });
}

export function useDeleteDocument(connectorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => deleteDocument(connectorId!, filename),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['discovery-documents', connectorId] }),
  });
}

export function useTriggerRun(connectorId: string | undefined) {
  return useMutation({
    mutationFn: (body: TriggerRunBody) => triggerRun(connectorId!, body),
  });
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['discovery-run', runId],
    queryFn: () => getRun(runId!),
    enabled: !!runId,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2000;
      if (data.status === 'completed' || data.status === 'failed') return false;
      return 2000;
    },
  });
}

export function useAnswerRun(runId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { answer?: string; answers?: string[] }) =>
      answerRun(runId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discovery-run', runId] }),
  });
}

export function useSkipRun(runId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => skipRun(runId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discovery-run', runId] }),
  });
}

export function useSuggestions(runId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['discovery-suggestions', runId],
    queryFn: () => listSuggestions(runId!).then((r) => r.data),
    enabled: !!runId && enabled,
  });
}

export function useUpdateSuggestion(runId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      body: { status?: 'approved' | 'rejected' | 'pending'; proposed_steps?: ProposedStep[] };
    }) => updateSuggestion(args.id, args.body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['discovery-suggestions', runId] }),
  });
}

export function useApplySuggestion(runId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; uopId: string }) =>
      applySuggestion(args.id, args.uopId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discovery-suggestions', runId] });
      qc.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useRefineSuggestion() {
  return useMutation({
    mutationFn: (args: {
      id: string;
      user_prompt: string;
      history: { role: 'user' | 'assistant'; text: string }[];
      current_steps: ProposedStep[];
    }) =>
      refineSuggestion(args.id, {
        user_prompt: args.user_prompt,
        history: args.history,
        current_steps: args.current_steps,
      }),
  });
}
