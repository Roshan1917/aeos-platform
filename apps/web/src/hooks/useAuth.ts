import { useEffect, useState } from 'react';

import { getCurrentClaims, useAuthStore } from '../lib/auth';
import type { AccessTokenClaims } from '../lib/jwt';

export function useAuth(): {
  isAuthenticated: boolean;
  claims: AccessTokenClaims | null;
  logout: () => void;
} {
  const accessToken = useAuthStore((s) => s.accessToken);
  const clear = useAuthStore((s) => s.clear);
  const [claims, setClaims] = useState<AccessTokenClaims | null>(getCurrentClaims());

  useEffect(() => {
    setClaims(accessToken ? getCurrentClaims() : null);
  }, [accessToken]);

  return {
    isAuthenticated: claims !== null,
    claims,
    logout: clear,
  };
}
