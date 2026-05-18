import jwt, { type SignOptions } from 'jsonwebtoken';
import type { TenantId } from '@aeos/canonical-schema';
import { tenantId } from '@aeos/canonical-schema';

export const TEST_JWT_SECRET = 'aeos-test-secret-do-not-use-in-production';

export interface MockTokenOptions {
  userId?: string;
  tid?: TenantId;
  roles?: string[];
  expiresIn?: string | number;
}

export function createTestToken(options: MockTokenOptions = {}): string {
  const {
    userId = 'test-user-id',
    tid = tenantId('test-tenant'),
    roles = ['admin'],
    expiresIn = '1h',
  } = options;

  return jwt.sign(
    {
      sub: userId,
      tenant_id: tid,
      roles,
    },
    TEST_JWT_SECRET,
    { expiresIn } as SignOptions,
  );
}

export function createTestAuthHeader(options: MockTokenOptions = {}): string {
  return `Bearer ${createTestToken(options)}`;
}
