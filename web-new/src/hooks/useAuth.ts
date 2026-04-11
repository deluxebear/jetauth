import { create } from "zustand";

// Lightweight store without extra deps — just React state via context would work too,
// but a simple module-level store keeps things flat.

interface User {
  owner: string;
  name: string;
  displayName: string;
  avatar: string;
  isAdmin: boolean;
  isGlobalAdmin: boolean;
  type: string;
  [key: string]: unknown;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  setLoading: (l: boolean) => void;
}

// Simple global state without zustand (no extra dep)
let _state: AuthState = {
  user: null,
  loading: true,
  setUser: () => {},
  setLoading: () => {},
};

const listeners = new Set<() => void>();

export function useAuthStore() {
  return _state;
}

export function setAuthUser(user: User | null) {
  _state = { ..._state, user, loading: false };
  listeners.forEach((l) => l());
}

export function setAuthLoading(loading: boolean) {
  _state = { ..._state, loading };
  listeners.forEach((l) => l());
}

export { type User };
