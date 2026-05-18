import { describe, it, expect, vi } from 'vitest';
import { CoworkAdapter } from '../src/adapter.js';

function makeFakeEmitter() {
  return {
    emitLlmCall: vi.fn(),
    emitToolCall: vi.fn(),
    emitDecision: vi.fn(),
    emitHumanOverride: vi.fn(),
  };
}

const baseConfig = { tenantId: 't1', agentId: 'a1' };

describe('CoworkAdapter.processSpan', () => {
  it('emits a decision when skill.name is present', () => {
    const emitter = makeFakeEmitter();
    const adapter = new CoworkAdapter({ config: baseConfig, emitter });
    const result = adapter.processSpan({
      spanId: 'span-1',
      attributes: { 'skill.name': 'kyc-approvals' },
      status: 'ok',
    });
    expect(result.emitted).toBe(true);
    expect(result.skillName).toBe('kyc-approvals');
    expect(emitter.emitDecision).toHaveBeenCalledTimes(1);
    const [decisionId, outcome] = emitter.emitDecision.mock.calls[0];
    expect(decisionId).toBe('cowork-span-1');
    expect(outcome.success).toBe(true);
    expect(outcome.outputSummary).toBe('cowork.skill:kyc-approvals');
  });

  it('skips when skill.name is missing', () => {
    const emitter = makeFakeEmitter();
    const adapter = new CoworkAdapter({ config: baseConfig, emitter });
    const result = adapter.processSpan({ spanId: 's', attributes: {} });
    expect(result.emitted).toBe(false);
    expect(result.reason).toBe('no_skill_attribute');
    expect(emitter.emitDecision).not.toHaveBeenCalled();
  });

  it('marks decision as failed when span status is error', () => {
    const emitter = makeFakeEmitter();
    const adapter = new CoworkAdapter({ config: baseConfig, emitter });
    adapter.processSpan({
      spanId: 's',
      attributes: { 'skill.name': 'foo' },
      status: 'error',
    });
    expect(emitter.emitDecision.mock.calls[0][1].success).toBe(false);
  });
});

describe('CoworkAdapter.processLog (bash detection)', () => {
  it('detects skill from cowork_event JSON', () => {
    const emitter = makeFakeEmitter();
    const adapter = new CoworkAdapter({ config: baseConfig, emitter });
    const result = adapter.processLog({
      body: '{"cowork_event":"skill_start","skill":"refund-review"}',
      sessionId: 'sess-A',
    });
    expect(result.emitted).toBe(true);
    expect(result.skillName).toBe('refund-review');
  });

  it('ignores logs without a cowork_event', () => {
    const emitter = makeFakeEmitter();
    const adapter = new CoworkAdapter({ config: baseConfig, emitter });
    const result = adapter.processLog({ body: 'random log line' });
    expect(result.emitted).toBe(false);
  });
});

describe('CoworkAdapter.processLog (Chrome MCP)', () => {
  const patterns = [
    { urlPattern: /\/kyc\/queue/, skillName: 'kyc-approvals' },
    { urlPattern: /\/refunds\/pending/, skillName: 'refund-review' },
  ];

  it('emits when navigate URL matches a pattern', () => {
    const emitter = makeFakeEmitter();
    const adapter = new CoworkAdapter({
      config: baseConfig,
      emitter,
      skillUrlPatterns: patterns,
    });
    const result = adapter.processLog({
      body: 'navigated',
      sessionId: 'sess-1',
      isChromeNavigate: true,
      navigateUrl: 'https://app.example.com/kyc/queue',
    });
    expect(result.emitted).toBe(true);
    expect(result.skillName).toBe('kyc-approvals');
  });

  it('deduplicates by session.id', () => {
    const emitter = makeFakeEmitter();
    const adapter = new CoworkAdapter({
      config: baseConfig,
      emitter,
      skillUrlPatterns: patterns,
    });
    const args = {
      body: 'navigated',
      sessionId: 'sess-1',
      isChromeNavigate: true,
      navigateUrl: 'https://app.example.com/kyc/queue',
    };
    expect(adapter.processLog(args).emitted).toBe(true);
    expect(adapter.processLog(args).emitted).toBe(false);
    expect(emitter.emitDecision).toHaveBeenCalledTimes(1);
  });

  it('returns no_url_pattern_match when URL does not match', () => {
    const emitter = makeFakeEmitter();
    const adapter = new CoworkAdapter({
      config: baseConfig,
      emitter,
      skillUrlPatterns: patterns,
    });
    const result = adapter.processLog({
      body: 'navigated',
      sessionId: 'sess-1',
      isChromeNavigate: true,
      navigateUrl: 'https://app.example.com/unrelated',
    });
    expect(result.emitted).toBe(false);
    expect(result.reason).toBe('no_url_pattern_match');
  });
});
