/**
 * AEOS Cowork Adapter
 *
 * Processes Claude Cowork OTLP traces/logs and emits AEOS skill-execution
 * spans via the shared adapter-sdk emitter. The detection logic is ported
 * from AITT (fuzebox-intelligence) `src/collectors/cowork-otel/`:
 *
 *   - Span path: any OTLP span with `skill.name` attribute → emitDecision
 *     with the skill as the agent activity.
 *   - Log path A (bash): `tool_result` body containing
 *     `{"cowork_event":"skill_start","skill":"<name>"}`.
 *   - Log path B (Chrome MCP): `Claude_in_Chrome` navigate URL matched
 *     against a configured `skillUrlPatterns[]`. Deduplicated per
 *     `session.id` so multiple navigations don't replay the same skill.
 *
 * Capped seenSessions map (1000 entries, FIFO eviction) prevents unbounded
 * growth in long-running processes.
 */
import { createAdapterEmitter } from '@aeos/adapter-sdk';
import type { AdapterConfig, AdapterEmitter } from '@aeos/adapter-sdk';

export interface CoworkSkillUrlPattern {
  /** Regex tested against the `Claude_in_Chrome` navigate URL. */
  urlPattern: RegExp;
  /** Skill name to emit when the URL matches. */
  skillName: string;
}

export interface CoworkAdapterOptions {
  /** AEOS identity for downstream attribution. */
  config: AdapterConfig;
  /** Span attribute key that marks a skill execution. Default: `skill.name`. */
  skillAttributeKey?: string;
  /** URL → skill mappings used to detect skills from Chrome MCP navigate calls. */
  skillUrlPatterns?: CoworkSkillUrlPattern[];
  /** Override the default emitter (used in tests). */
  emitter?: AdapterEmitter;
}

export interface CoworkSpanInput {
  spanId: string;
  /** Flattened OTLP attributes — caller normalizes from the wire format. */
  attributes: Record<string, string | number | boolean | undefined>;
  status?: 'ok' | 'error' | 'unset';
  /** Optional explicit decisionId; auto-generated when omitted. */
  decisionId?: string;
}

export interface CoworkLogInput {
  /** Body string after OTLP `anyValueToString` normalization. */
  body: string;
  attributes?: Record<string, string | number | boolean | undefined>;
  /** Session id for Chrome MCP dedup; pulled from `session.id` attribute by AITT. */
  sessionId?: string;
  /** True when this log is a Claude_in_Chrome navigate tool result. */
  isChromeNavigate?: boolean;
  /** Navigate URL extracted from the log; only used when isChromeNavigate is true. */
  navigateUrl?: string;
}

export interface SkillEventResult {
  /** True if a span was emitted; false if skipped (no skill match, dedup hit, etc.). */
  emitted: boolean;
  skillName?: string;
  reason?: string;
}

const DEFAULT_SKILL_ATTR_KEY = 'skill.name';
const MAX_SEEN_SESSIONS = 1_000;

const COWORK_BASH_EVENT_RE = /"cowork_event"\s*:\s*"skill_start"[^}]*"skill"\s*:\s*"([^"]+)"/;

export class CoworkAdapter {
  readonly config: AdapterConfig;
  private readonly emitter: AdapterEmitter;
  private readonly skillAttributeKey: string;
  private readonly skillUrlPatterns: CoworkSkillUrlPattern[];
  /** sessionId → emitted skillName (FIFO-evicted at MAX_SEEN_SESSIONS). */
  private readonly seenSessions = new Map<string, string>();

  constructor(options: CoworkAdapterOptions) {
    this.config = options.config;
    this.emitter = options.emitter ?? createAdapterEmitter(options.config);
    this.skillAttributeKey = options.skillAttributeKey ?? DEFAULT_SKILL_ATTR_KEY;
    this.skillUrlPatterns = options.skillUrlPatterns ?? [];
  }

  /**
   * Process an OTLP span. Emits a decision span when `skill.name` attribute
   * is present.
   */
  processSpan(span: CoworkSpanInput): SkillEventResult {
    const skill = span.attributes[this.skillAttributeKey];
    if (typeof skill !== 'string' || skill.length === 0) {
      return { emitted: false, reason: 'no_skill_attribute' };
    }
    const decisionId = span.decisionId ?? `cowork-${span.spanId}`;
    this.emitter.emitDecision(decisionId, {
      success: span.status !== 'error',
      outputSummary: `cowork.skill:${skill}`,
    });
    return { emitted: true, skillName: skill };
  }

  /**
   * Process an OTLP log record. Tries bash detection first, then Chrome MCP.
   */
  processLog(log: CoworkLogInput): SkillEventResult {
    const fromBash = this.detectBashSkill(log.body);
    if (fromBash) {
      const decisionId = `cowork-bash-${log.sessionId ?? cryptoRandom()}`;
      this.emitter.emitDecision(decisionId, {
        success: true,
        outputSummary: `cowork.skill:${fromBash}`,
      });
      return { emitted: true, skillName: fromBash };
    }

    if (log.isChromeNavigate && log.navigateUrl !== undefined) {
      const skill = this.matchUrlPattern(log.navigateUrl);
      if (skill === undefined) {
        return { emitted: false, reason: 'no_url_pattern_match' };
      }
      if (log.sessionId !== undefined && this.seenSessions.has(log.sessionId)) {
        return { emitted: false, reason: 'session_already_seen' };
      }
      const decisionId = `cowork-chrome-${log.sessionId ?? cryptoRandom()}`;
      this.emitter.emitDecision(decisionId, {
        success: true,
        outputSummary: `cowork.skill:${skill}`,
      });
      if (log.sessionId !== undefined) {
        this.rememberSession(log.sessionId, skill);
      }
      return { emitted: true, skillName: skill };
    }

    return { emitted: false, reason: 'no_skill_signal' };
  }

  /** Test-only — exposes the dedup cache size. */
  cacheSize(): number {
    return this.seenSessions.size;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private detectBashSkill(body: string): string | undefined {
    const match = body.match(COWORK_BASH_EVENT_RE);
    return match?.[1];
  }

  private matchUrlPattern(url: string): string | undefined {
    for (const pattern of this.skillUrlPatterns) {
      if (pattern.urlPattern.test(url)) {
        return pattern.skillName;
      }
    }
    return undefined;
  }

  private rememberSession(sessionId: string, skillName: string): void {
    if (this.seenSessions.size >= MAX_SEEN_SESSIONS) {
      // FIFO eviction — drop oldest entry
      const firstKey = this.seenSessions.keys().next().value;
      if (firstKey !== undefined) {
        this.seenSessions.delete(firstKey);
      }
    }
    this.seenSessions.set(sessionId, skillName);
  }
}

function cryptoRandom(): string {
  // Avoid bringing in a dep; Node 18+ exposes crypto.randomUUID at runtime.
  // Fallback to Date.now+Math.random for environments without it.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
