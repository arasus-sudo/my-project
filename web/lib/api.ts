import axios from "axios";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("pitcheq_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("pitcheq_token");
      localStorage.removeItem("pitcheq_user");
      localStorage.removeItem("pitcheq_workspace");
      if (
        !window.location.pathname.startsWith("/login") &&
        !window.location.pathname.startsWith("/signup") &&
        window.location.pathname !== "/"
      ) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);
