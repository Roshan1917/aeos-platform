import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured — set it in services/test-generator/.env',
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }
  return _client;
}

export interface LlmCallOutcome {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

const PRICE_PER_INPUT_TOKEN = 3 / 1_000_000;
const PRICE_PER_OUTPUT_TOKEN = 15 / 1_000_000;

export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number } = {},
): Promise<LlmCallOutcome> {
  const start = Date.now();
  const response = await getAnthropic().messages.create({
    model: config.ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd =
    inputTokens * PRICE_PER_INPUT_TOKEN + outputTokens * PRICE_PER_OUTPUT_TOKEN;

  return {
    text,
    inputTokens,
    outputTokens,
    costUsd: Number(costUsd.toFixed(6)),
    durationMs: Date.now() - start,
  };
}
