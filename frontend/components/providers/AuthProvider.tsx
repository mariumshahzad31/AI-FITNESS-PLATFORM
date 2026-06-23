"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as apiClient from "@/lib/api";
import { tokenStore } from "@/lib/tokens";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, fullName: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Failsafe: never let a slow or unavailable backend keep the app stuck on a
    // loading spinner. If the session check hasn't resolved in time, render the
    // app anyway — the user simply appears logged-out until the backend recovers.
    const failsafe = setTimeout(() => {
      if (active) setLoading(false);
    }, 4000);

    (async () => {
      if (!tokenStore.getAccess()) {
        if (active) setLoading(false);
        return;
      }
      try {
        const me = await apiClient.fetchMe();
        if (active) setUser(me);
      } catch {
        // Expired/invalid session or backend down — treat as logged-out.
        tokenStore.clear();
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      clearTimeout(failsafe);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiClient.login(email, password);
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const res = await apiClient.register(email, password, fullName);
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await apiClient.logout(tokenStore.getRefresh());
    tokenStore.clear();
    setUser(null);
    router.push("/login");
  }, [router]);

  const refreshUser = useCallback(async () => {
    const me = await apiClient.fetchMe();
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser, setUser }),
    [user, loading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
