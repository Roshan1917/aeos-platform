import type { DiscoveryDataset } from '../types.js';

export abstract class BaseDiscoveryConnector {
  protected readonly config: Record<string, unknown>;

  constructor(config: Record<string, unknown>) {
    this.config = config;
  }

  abstract fetchData(): Promise<DiscoveryDataset>;

  buildSummary(dataset: DiscoveryDataset): Record<string, unknown> {
    const categories = [...new Set(dataset.items.map((i) => i.category))];
    return {
      source: dataset.source,
      item_count: dataset.items.length,
      categories,
      fetched_at: dataset.fetched_at,
    };
  }
}
