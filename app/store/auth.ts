"use client";
import { create } from "zustand";
import { authApi, type AuthUser } from "@/lib/api";

interface AuthStore {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  setUser: (user: AuthUser | null) => void;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  setUser: (user) => set({ user }),

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const user = await authApi.me();
      set({ user, isInitialized: true });
    } catch {
      set({ user: null, isInitialized: true });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    set({ user: null });
  },
}));

// Listen for 401 responses dispatched by the axios interceptor.
// Must call the logout endpoint first to clear the httpOnly cookie — without
// that, the Next.js middleware sees the cookie and bounces /login → /dashboard.
let _handlingUnauthorized = false;
if (typeof window !== "undefined") {
  window.addEventListener("auth:unauthorized", async () => {
    if (_handlingUnauthorized) return;
    _handlingUnauthorized = true;
    useAuthStore.setState({ user: null, isInitialized: true });
    if (!window.location.pathname.startsWith("/login") && window.location.pathname !== "/") {
      try { await authApi.logout(); } catch { /* ignore */ }
      window.location.replace("/login");
    }
    // Reset after a short delay in case navigation didn't complete
    setTimeout(() => { _handlingUnauthorized = false; }, 3000);
  });
}
