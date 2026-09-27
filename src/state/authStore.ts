import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/persistence/zustandStorage';
import type { TwitchUser } from '@/lib/twitch/types';

export type AuthStatus = 'anonymous' | 'authenticated' | 'expired';

interface AuthStore {
  token: string | null;
  user: TwitchUser | null;
  status: AuthStatus;
  signIn(token: string, user: TwitchUser): void;
  setUser(user: TwitchUser): void;
  markExpired(): void;
  signOut(): void;
}

export const useAuth = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      status: 'anonymous',
      signIn: (token, user) => set({ token, user, status: 'authenticated' }),
      setUser: (user) => set({ user }),
      markExpired: () => set((s) => (s.token ? { token: null, status: 'expired' } : s)),
      signOut: () => set({ token: null, user: null, status: 'anonymous' }),
    }),
    { name: 'auth', version: 1, storage: zustandStorage() },
  ),
);
