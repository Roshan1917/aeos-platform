import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { decodeJwt, type AccessTokenClaims } from './jwt';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (tokens: { access: string; refresh: string }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      setTokens: ({ access, refresh }) =>
        set({ accessToken: access, refreshToken: refresh }),
      clear: () => set({ accessToken: null, refreshToken: null }),
    }),
    {
      name: 'aeos-auth',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function getCurrentClaims(): AccessTokenClaims | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}
