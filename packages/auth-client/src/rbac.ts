import type { AuthContext, PermissionCheckResult } from './types.js';

export async function checkPermission(
  ctx: AuthContext,
  resource: string,
  action: string,
): Promise<PermissionCheckResult> {
  const authServiceUrl = process.env['AUTH_SERVICE_URL'];
  if (!authServiceUrl) {
    throw new Error('AUTH_SERVICE_URL not configured');
  }

  const response = await fetch(`${authServiceUrl}/v1/rbac/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: ctx.userId,
      tenant_id: ctx.tenantId,
      resource,
      action,
    }),
  });

  if (!response.ok) {
    throw new Error(`RBAC check failed: ${response.status}`);
  }

  const body = (await response.json()) as { allowed: boolean; reason?: string };
  return { allowed: body.allowed, reason: body.reason };
}

export async function requirePermission(
  ctx: AuthContext,
  resource: string,
  action: string,
): Promise<void> {
  const result = await checkPermission(ctx, resource, action);
  if (!result.allowed) {
    const err = new Error(`Forbidden: ${resource}:${action}`);
    (err as NodeJS.ErrnoException).code = 'FORBIDDEN';
    throw err;
  }
}
