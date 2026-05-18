export interface AccessTokenClaims {
  sub: string;
  tenant_id: string;
  roles: string[];
  agent_contract_id?: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

function base64UrlDecode(input: string): string {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(
    atob(b64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  );
}

export function decodeJwt(token: string): AccessTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new Error('Malformed JWT');
  }
  return JSON.parse(base64UrlDecode(parts[1])) as AccessTokenClaims;
}

export function isExpired(token: string, skewSeconds = 30): boolean {
  try {
    const { exp } = decodeJwt(token);
    return Date.now() / 1000 >= exp - skewSeconds;
  } catch {
    return true;
  }
}
