import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("pitcheq_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [workspace, setWorkspace] = useState(() => {
    const raw = localStorage.getItem("pitcheq_workspace");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("pitcheq_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me")
      .then((r) => { setUser(r.data.user); setWorkspace(r.data.workspace); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const persist = (token, u, ws) => {
    localStorage.setItem("pitcheq_token", token);
    localStorage.setItem("pitcheq_user", JSON.stringify(u));
    localStorage.setItem("pitcheq_workspace", JSON.stringify(ws));
    setUser(u); setWorkspace(ws);
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    persist(data.token, data.user, data.workspace);
    return data;
  };
  const signup = async (payload) => {
    const { data } = await api.post("/auth/signup", payload);
    persist(data.token, data.user, data.workspace);
    return data;
  };
  const logout = () => {
    localStorage.removeItem("pitcheq_token");
    localStorage.removeItem("pitcheq_user");
    localStorage.removeItem("pitcheq_workspace");
    setUser(null); setWorkspace(null);
    window.location.href = "/";
  };

  return (
    <AuthCtx.Provider value={{ user, workspace, loading, login, signup, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
