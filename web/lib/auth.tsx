"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthWorkspace {
  id: string;
  name: string;
}

interface SignupPayload {
  name: string;
  email: string;
  password: string;
  workspace_name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  workspace: AuthWorkspace | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<unknown>;
  signup: (payload: SignupPayload) => Promise<unknown>;
  logout: () => void;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("pitcheq_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [workspace, setWorkspace] = useState<AuthWorkspace | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("pitcheq_workspace");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("pitcheq_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => {
        setUser(r.data.user);
        setWorkspace(r.data.workspace);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const persist = (token: string, u: AuthUser, ws: AuthWorkspace) => {
    localStorage.setItem("pitcheq_token", token);
    localStorage.setItem("pitcheq_user", JSON.stringify(u));
    localStorage.setItem("pitcheq_workspace", JSON.stringify(ws));
    setUser(u);
    setWorkspace(ws);
  };

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    persist(data.token, data.user, data.workspace);
    return data;
  };

  const signup = async (payload: SignupPayload) => {
    const { data } = await api.post("/auth/signup", payload);
    persist(data.token, data.user, data.workspace);
    return data;
  };

  const logout = () => {
    localStorage.removeItem("pitcheq_token");
    localStorage.removeItem("pitcheq_user");
    localStorage.removeItem("pitcheq_workspace");
    setUser(null);
    setWorkspace(null);
    window.location.href = "/";
  };

  return (
    <AuthCtx.Provider value={{ user, workspace, loading, login, signup, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
