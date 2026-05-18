import { Redis } from 'ioredis';
import { config } from '../config.js';

let _client: Redis | null = null;

export function getRedis(): Redis {
  if (!_client) {
    _client = new Redis(config.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    _client.on('error', (err: Error) => {
      console.error('[discovery] redis error:', err.message);
    });
  }
  return _client;
}

export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}
