import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured — set it in services/discovery/.env',
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }
  return _client;
}

export const ANTHROPIC_MODEL = config.ANTHROPIC_MODEL;

// Re-export LLM types under the local aliases used by the discovery agents.
export type LLMTool = Anthropic.Tool;
export type LLMMessageParam = Anthropic.MessageParam;
export type LLMContentBlockParam = Anthropic.ContentBlockParam;
export type LLMToolResultBlockParam = Anthropic.ToolResultBlockParam;
export type LLMToolUseBlock = Anthropic.ToolUseBlock;
export type LLMTextBlock = Anthropic.TextBlock;
export type LLMTextBlockParam = Anthropic.TextBlockParam;
export type LLMImageBlockParam = Anthropic.ImageBlockParam;
export type LLMDocumentBlockParam = Anthropic.DocumentBlockParam;
