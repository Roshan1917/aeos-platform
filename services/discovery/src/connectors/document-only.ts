import { BaseDiscoveryConnector } from './base.js';
import type { DiscoveryDataset } from '../types.js';

export class DocumentOnlyConnector extends BaseDiscoveryConnector {
  async fetchData(): Promise<DiscoveryDataset> {
    return {
      source: 'Documents',
      items: [],
      fetched_at: new Date().toISOString(),
    };
  }
}
