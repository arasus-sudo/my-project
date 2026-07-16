import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pitcheq_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 402 always means the workspace ran out of credits. The backend sends a
// structured body ({action, action_label, needed, balance}) so the UI can say
// what was refused and how short it was — surfaced once, globally, rather than
// re-handled in every agent.
export const OUT_OF_CREDITS_EVENT = "innoira:out-of-credits";
export const CREDITS_CHANGED_EVENT = "innoira:credits-changed";
export const notifyCreditsChanged = () => window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));

/** A 402 already raised its own out-of-credits toast globally. Agents guard
 *  their generic "that failed" toast with this so the user sees one message,
 *  not two. */
export const isCreditError = (err) => err?.response?.status === 402;

api.interceptors.response.use(
  (r) => {
    // Any successful write may have spent credits. Rather than have each agent
    // remember to refresh the balance, nudge the meter from here.
    if (r.config?.method && r.config.method !== "get") notifyCreditsChanged();
    return r;
  },
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      localStorage.removeItem("pitcheq_token");
      localStorage.removeItem("pitcheq_user");
      if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/signup") && window.location.pathname !== "/") {
        window.location.href = "/login";
      }
    }
    if (status === 402) {
      const d = err?.response?.data?.detail;
      if (d && typeof d === "object") {
        window.dispatchEvent(new CustomEvent(OUT_OF_CREDITS_EVENT, { detail: d }));
      }
    }
    return Promise.reject(err);
  }
);
