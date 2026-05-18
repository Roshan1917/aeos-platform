import Anthropic from '@anthropic-ai/sdk';
import type { AdapterConfig } from '@aeos/adapter-sdk';

// TODO: Implement full adapter wrapping Anthropic's messages.create()
// This is a stub — see sdk/CLAUDE.md for the full adapter contract.

export class AnthropicAeosAdapter {
  private readonly client: Anthropic;
  private readonly config: AdapterConfig;

  constructor(config: AdapterConfig, anthropicApiKey?: string) {
    this.config = config;
    this.client = new Anthropic({ apiKey: anthropicApiKey });
  }

  get messages() {
    return {
      create: async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        const decisionId = crypto.randomUUID();
        const start = Date.now();

        // TODO: emit onLlmCallStart span

        const response = await this.client.messages.create(params);

        // TODO: emit onLlmCallEnd span with token counts + cost

        return response;
      },
    };
  }
}
