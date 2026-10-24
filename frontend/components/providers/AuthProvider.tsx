"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as apiClient from "@/lib/api";
import { tokenStore } from "@/lib/tokens";
import { clearCurrentUserId } from "@/lib/localDb";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, fullName: string) => Promise<User>;
  continueAsGuest: () => Promise<User>;
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
    (async () => {
      try {
        const me = await apiClient.fetchMe();
        if (active) setUser(me);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiClient.login(email, password);
    if (res.accessToken) {
      tokenStore.set(res.accessToken, res.refreshToken);
      clearCurrentUserId();
    } else tokenStore.clear();
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const res = await apiClient.register(email, password, fullName);
    tokenStore.set(res.accessToken, res.refreshToken);
    clearCurrentUserId();
    setUser(res.user);
    return res.user;
  }, []);

  const continueAsGuest = useCallback(async () => {
    tokenStore.clear();
    clearCurrentUserId();
    const guest = await apiClient.createGuest();
    setUser(guest);
    return guest;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      tokenStore.clear();
      clearCurrentUserId();
    }
    setUser(null);
    router.push("/login");
  }, [router]);

  const refreshUser = useCallback(async () => {
    const me = await apiClient.fetchMe();
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, continueAsGuest, logout, refreshUser, setUser }),
    [user, loading, login, register, continueAsGuest, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
