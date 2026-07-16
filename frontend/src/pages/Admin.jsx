import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Shield, LogOut, ChevronLeft, Ban, Trash2, RefreshCw } from "lucide-react";

export default function Admin() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState("workspaces");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [s, w, u] = await Promise.all([
        api.get("/admin/summary"),
        api.get("/admin/workspaces"),
        api.get("/admin/users"),
      ]);
      setSummary(s.data); setWorkspaces(w.data); setUsers(u.data);
    } catch (err) {
      if (err?.response?.status === 403) toast.error("Admin access only");
    } finally { setBusy(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (user && user.is_admin === false) return <Navigate to="/app" replace />;

  const toggleUser = async (id) => {
    try { await api.post(`/admin/users/${id}/toggle`); load(); } catch { toast.error("Failed"); }
  };
  const deleteUser = async (id) => {
    if (!confirm("Delete this user permanently?")) return;
    try { await api.delete(`/admin/users/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const toggleWs = async (id) => {
    try { await api.post(`/admin/workspaces/${id}/toggle`); load(); } catch { toast.error("Failed"); }
  };

  return (
    <div className="min-h-screen bg-bone animate-fade-in">
      <header className="bg-white border-b border-line">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center gap-4">
          <button onClick={() => nav("/app")} className="btn-ghost" data-testid="admin-back-to-app">
            <ChevronLeft size={14} /> App
          </button>
          <div className="flex items-center gap-2">
            <Shield size={16} />
            <span className="font-display font-semibold">Suite Admin</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3 text-sm text-neutral-500 min-w-0">
            <span className="font-mono text-xs">{user?.email}</span>
            <button onClick={load} className="btn-ghost" data-testid="admin-refresh"><RefreshCw size={12} /></button>
            <button onClick={logout} className="btn-ghost"><LogOut size={12} /></button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 sm:p-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {summary && [
            { k: "Workspaces", v: summary.workspaces },
            { k: "Users", v: summary.users },
            { k: "Campaigns", v: `${summary.active_campaigns}/${summary.campaigns}` },
            { k: "Sent", v: summary.sent_events },
            { k: "Replies", v: summary.replied_events },
          ].map((c) => (
            <div key={c.k} className="bg-white border border-line rounded-2xl shadow-card p-5">
              <div className="ui-label">{c.k}</div>
              <div className="font-mono text-2xl sm:text-3xl font-bold mt-1 tracking-tighter">{c.v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4">
          {["workspaces", "users"].map((t) => (
            <button key={t} onClick={() => setTab(t)} data-testid={`admin-tab-${t}`}
              className={`px-4 py-2 rounded-xl text-sm ${tab === t ? "bg-ink text-white" : "hover:bg-white text-neutral-500"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          {busy && <span className="text-xs text-neutral-400 ml-3">Loading…</span>}
        </div>

        {tab === "workspaces" && (
          <div className="bg-white border border-line rounded-2xl overflow-hidden card-floating">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-line">
                  {["Workspace", "Users", "Campaigns", "Leads", "Sent", "Replied", "Status", ""].map((h) => (
                    <th key={h} className="ui-label text-left p-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workspaces.map((w) => (
                  <tr key={w.id} className="border-b border-line hover:bg-ash">
                    <td className="p-3">
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-neutral-400 font-mono">{w.plan || "trial"}</div>
                    </td>
                    <td className="p-3 font-mono">{w.stats.users}</td>
                    <td className="p-3 font-mono">{w.stats.campaigns}</td>
                    <td className="p-3 font-mono">{w.stats.leads}</td>
                    <td className="p-3 font-mono">{w.stats.sent}</td>
                    <td className="p-3 font-mono">{w.stats.replied}</td>
                    <td className="p-3">
                      <span className={`ui-label px-2 py-1 border rounded-full ${w.blocked ? "text-red-700 border-red-500" : "text-green-700 border-green-600"}`}>
                        {w.blocked ? "blocked" : "active"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => toggleWs(w.id)} data-testid={`admin-ws-toggle-${w.id}`}
                        className="btn-ghost text-xs">
                        <Ban size={12} /> {w.blocked ? "Unblock" : "Block"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "users" && (
          <div className="bg-white border border-line rounded-2xl overflow-hidden card-floating">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-line">
                  {["User", "Email", "Workspace", "Role", "Status", ""].map((h) => (
                    <th key={h} className="ui-label text-left p-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-line hover:bg-ash">
                    <td className="p-3 font-medium">
                      {u.name} {u.is_admin && <span className="pill text-[9px] ml-1">Admin</span>}
                    </td>
                    <td className="p-3 font-mono text-xs">{u.email}</td>
                    <td className="p-3 text-neutral-500">{u.workspace_name || "—"}</td>
                    <td className="p-3 text-xs">{u.role}</td>
                    <td className="p-3">
                      <span className={`ui-label px-2 py-1 border rounded-full ${u.blocked ? "text-red-700 border-red-500" : "text-green-700 border-green-600"}`}>
                        {u.blocked ? "blocked" : "active"}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1 flex flex-wrap justify-end gap-1">
                      <button onClick={async () => {
                        try {
                          const { data } = await api.post(`/admin/impersonate/${u.id}`);
                          localStorage.setItem("pitcheq_token", data.token);
                          localStorage.setItem("pitcheq_user", JSON.stringify(data.user));
                          localStorage.setItem("pitcheq_workspace", JSON.stringify(data.workspace));
                          toast.success(`Impersonating ${u.email}`);
                          window.location.href = "/app";
                        } catch { toast.error("Impersonation failed"); }
                      }} data-testid={`admin-impersonate-${u.id}`} className="btn-ghost text-xs">
                        <Shield size={12} /> Login as
                      </button>
                      <button onClick={() => toggleUser(u.id)} data-testid={`admin-user-toggle-${u.id}`} className="btn-ghost text-xs">
                        <Ban size={12} /> {u.blocked ? "Unblock" : "Block"}
                      </button>
                      {!u.is_admin && (
                        <button onClick={() => deleteUser(u.id)} data-testid={`admin-user-delete-${u.id}`} className="btn-ghost text-xs text-red-600 hover:bg-red-50">
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
