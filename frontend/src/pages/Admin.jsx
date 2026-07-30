import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Shield, LogOut, ChevronLeft, Ban, Trash2, RefreshCw, AlertTriangle, CheckCircle2, DollarSign, Activity, X } from "lucide-react";

export default function Admin() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [ticks, setTicks] = useState([]);
  const [tokenUsage, setTokenUsage] = useState(null);
  const [tab, setTab] = useState("workspaces");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const viewActivity = async (uid) => {
    setActivityLoading(true);
    try {
      const { data } = await api.get(`/admin/users/${uid}/activity`);
      setActivity(data);
    } catch {
      toast.error("Could not load activity");
    } finally { setActivityLoading(false); }
  };

  const load = async () => {
    setBusy(true);
    try {
      const [s, w, u, t, tu] = await Promise.all([
        api.get("/admin/summary"),
        api.get("/admin/workspaces"),
        api.get("/admin/users"),
        api.get("/admin/tick-health"),
        api.get("/admin/token-usage"),
      ]);
      setSummary(s.data); setWorkspaces(w.data); setUsers(u.data); setTicks(t.data); setTokenUsage(tu.data);
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
          <div className="ml-auto flex items-center gap-2 sm:gap-3 text-caption text-ink-muted min-w-0">
            <span className="font-mono text-caption">{user?.email}</span>
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
              <div className="text-app-title font-display font-bold mt-1 tracking-tighter">{c.v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4">
          {["workspaces", "users", "system", "cost"].map((t) => (
            <button key={t} onClick={() => setTab(t)} data-testid={`admin-tab-${t}`}
              className={`px-4 py-2 rounded-xl text-body ${tab === t ? "bg-ink text-white" : "hover:bg-white text-ink-muted"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          {busy && <span className="text-caption text-ink-muted ml-3">Loading…</span>}
        </div>

        {tab === "workspaces" && (
          <div className="bg-white border border-line rounded-2xl card-floating overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-table min-w-[640px]">
                <thead>
                  <tr className="border-b border-line">
                    {["Workspace", "Users", "Campaigns", "Leads", "Sent", "Replied", "Status", ""].map((h) => (
                      <th key={h} className="table-header text-left p-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workspaces.map((w) => (
                    <tr key={w.id} className="border-b border-line hover:bg-ash">
                      <td className="p-3">
                        <div className="font-medium">{w.name}</div>
                        <div className="text-caption text-ink-muted font-mono">{w.plan || "trial"}</div>
                      </td>
                      <td className="p-3 font-mono">{w.stats.users}</td>
                      <td className="p-3 font-mono">{w.stats.campaigns}</td>
                      <td className="p-3 font-mono">{w.stats.leads}</td>
                      <td className="p-3 font-mono">{w.stats.sent}</td>
                      <td className="p-3 font-mono">{w.stats.replied}</td>
                      <td className="p-3">
                        <span className={`ui-label px-2 py-1 border rounded-full ${w.blocked ? "text-danger border-danger" : "text-success border-success"}`}>
                          {w.blocked ? "blocked" : "active"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => toggleWs(w.id)} data-testid={`admin-ws-toggle-${w.id}`}
                          className="btn-ghost text-caption">
                          <Ban size={12} /> {w.blocked ? "Unblock" : "Block"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="bg-white border border-line rounded-2xl card-floating overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-table min-w-[640px]">
                <thead>
                  <tr className="border-b border-line">
                    {["User", "Email", "Workspace", "Role", "Last active", "Status", ""].map((h) => (
                      <th key={h} className="table-header text-left p-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-line hover:bg-ash">
                      <td className="p-3 font-medium">
                        {u.name} {u.is_admin && <span className="pill ml-1">Admin</span>}
                      </td>
                      <td className="p-3 font-mono text-caption">{u.email}</td>
                      <td className="p-3 text-ink-muted">{u.workspace_name || "—"}</td>
                      <td className="p-3 text-caption">{u.role}</td>
                      <td className="p-3 text-caption text-ink-muted font-mono">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never"}
                      </td>
                      <td className="p-3">
                        <span className={`ui-label px-2 py-1 border rounded-full ${u.blocked ? "text-danger border-danger" : "text-success border-success"}`}>
                          {u.blocked ? "blocked" : "active"}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1 flex flex-wrap justify-end gap-1">
                        <button onClick={() => viewActivity(u.id)} data-testid={`admin-activity-${u.id}`} className="btn-ghost text-caption">
                          <Activity size={12} /> Activity
                        </button>
                        <button onClick={async () => {
                          try {
                            const { data } = await api.post(`/admin/impersonate/${u.id}`);
                            localStorage.setItem("pitcheq_token", data.token);
                            localStorage.setItem("pitcheq_user", JSON.stringify(data.user));
                            localStorage.setItem("pitcheq_workspace", JSON.stringify(data.workspace));
                            toast.success(`Impersonating ${u.email}`);
                            window.location.href = "/app";
                          } catch { toast.error("Impersonation failed"); }
                        }} data-testid={`admin-impersonate-${u.id}`} className="btn-ghost text-caption">
                          <Shield size={12} /> Login as
                        </button>
                        <button onClick={() => toggleUser(u.id)} data-testid={`admin-user-toggle-${u.id}`} className="btn-ghost text-caption">
                          <Ban size={12} /> {u.blocked ? "Unblock" : "Block"}
                        </button>
                        {!u.is_admin && (
                          <button onClick={() => deleteUser(u.id)} data-testid={`admin-user-delete-${u.id}`} className="btn-ghost text-caption text-danger hover:bg-danger/10">
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "system" && (
          <div className="bg-white border border-line rounded-2xl card-floating overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-table min-w-[640px]">
                <thead>
                  <tr className="border-b border-line">
                    {["Tick", "Last run", "Last success", "Runs", "Errors", "Last error"].map((h) => (
                      <th key={h} className="table-header text-left p-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ticks.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-ink-muted">No ticks have run yet.</td></tr>
                  )}
                  {ticks.map((t) => {
                    const failing = t.last_error && t.last_run_at !== t.last_success_at;
                    return (
                      <tr key={t.tick_id} className="border-b border-line hover:bg-ash">
                        <td className="p-3 font-medium font-mono text-caption">{t.tick_id}</td>
                        <td className="p-3 text-caption text-ink-muted font-mono">{t.last_run_at ? new Date(t.last_run_at).toLocaleString() : "—"}</td>
                        <td className="p-3 text-caption text-ink-muted font-mono">{t.last_success_at ? new Date(t.last_success_at).toLocaleString() : "—"}</td>
                        <td className="p-3 font-mono">{t.run_count || 0}</td>
                        <td className="p-3 font-mono">{t.error_count || 0}</td>
                        <td className="p-3 text-caption max-w-xs truncate">
                          {failing ? (
                            <span className="text-danger inline-flex items-center gap-1"><AlertTriangle size={12} /> {t.last_error}</span>
                          ) : t.last_run_at ? (
                            <span className="text-success inline-flex items-center gap-1"><CheckCircle2 size={12} /> OK</span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "cost" && (
          <div className="space-y-4">
            <p className="text-caption text-ink-muted">
              Real LLM token cost — what agent actions actually cost us to run, independent of the
              flat credit prices workspaces are charged. Internal COGS visibility only.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-white border border-line rounded-2xl shadow-card p-5">
                <div className="ui-label flex items-center gap-1.5"><DollarSign size={12} /> Total LLM cost</div>
                <div className="text-app-title font-display font-bold mt-1 tracking-tighter">
                  ${(tokenUsage?.total_cost_usd ?? 0).toFixed(4)}
                </div>
              </div>
              <div className="bg-white border border-line rounded-2xl shadow-card p-5">
                <div className="ui-label">LLM calls logged</div>
                <div className="text-app-title font-display font-bold mt-1 tracking-tighter">
                  {tokenUsage?.total_calls ?? 0}
                </div>
              </div>
            </div>

            <div className="bg-white border border-line rounded-2xl card-floating overflow-hidden">
              <div className="p-3 border-b border-line text-caption font-medium">Cost by workspace</div>
              <div className="overflow-x-auto">
                <table className="w-full text-table min-w-[480px]">
                  <thead>
                    <tr className="border-b border-line">
                      {["Workspace", "Calls", "Cost"].map((h) => (
                        <th key={h} className="table-header text-left p-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(!tokenUsage?.by_workspace || tokenUsage.by_workspace.length === 0) && (
                      <tr><td colSpan={3} className="p-6 text-center text-ink-muted">No LLM usage logged yet.</td></tr>
                    )}
                    {tokenUsage?.by_workspace?.map((w) => (
                      <tr key={w.workspace_id} className="border-b border-line hover:bg-ash">
                        <td className="p-3 font-medium">{w.workspace_name}</td>
                        <td className="p-3 font-mono">{w.calls}</td>
                        <td className="p-3 font-mono">${w.cost_usd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-line rounded-2xl card-floating overflow-hidden">
              <div className="p-3 border-b border-line text-caption font-medium">Cost by model</div>
              <div className="overflow-x-auto">
                <table className="w-full text-table min-w-[480px]">
                  <thead>
                    <tr className="border-b border-line">
                      {["Model", "Calls", "Cost"].map((h) => (
                        <th key={h} className="table-header text-left p-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(!tokenUsage?.by_model || tokenUsage.by_model.length === 0) && (
                      <tr><td colSpan={3} className="p-6 text-center text-ink-muted">No LLM usage logged yet.</td></tr>
                    )}
                    {tokenUsage?.by_model?.map((m) => (
                      <tr key={m.model} className="border-b border-line hover:bg-ash">
                        <td className="p-3 font-mono">{m.model}</td>
                        <td className="p-3 font-mono">{m.calls}</td>
                        <td className="p-3 font-mono">${m.cost_usd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-line rounded-2xl card-floating overflow-hidden">
              <div className="p-3 border-b border-line text-caption font-medium">Cost by user</div>
              <div className="overflow-x-auto">
                <table className="w-full text-table min-w-[480px]">
                  <thead>
                    <tr className="border-b border-line">
                      {["User", "Workspace", "Calls", "Cost"].map((h) => (
                        <th key={h} className="table-header text-left p-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(!tokenUsage?.by_user || tokenUsage.by_user.length === 0) && (
                      <tr><td colSpan={4} className="p-6 text-center text-ink-muted">No per-user LLM usage attributed yet.</td></tr>
                    )}
                    {tokenUsage?.by_user?.map((u) => (
                      <tr key={u.user_id} className="border-b border-line hover:bg-ash cursor-pointer" onClick={() => viewActivity(u.user_id)}>
                        <td className="p-3">
                          <div className="font-medium">{u.name}</div>
                          <div className="text-caption text-ink-muted font-mono">{u.email}</div>
                        </td>
                        <td className="p-3 text-ink-muted">{u.workspace_name}</td>
                        <td className="p-3 font-mono">{u.calls}</td>
                        <td className="p-3 font-mono">${u.cost_usd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {(activity || activityLoading) && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={() => setActivity(null)}>
          <div className="bg-white rounded-2xl shadow-card w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-line flex items-center justify-between">
              <div>
                <div className="font-display font-semibold">
                  {activity ? activity.user.name : "Loading…"}
                </div>
                {activity && <div className="text-caption text-ink-muted font-mono">{activity.user.email}</div>}
              </div>
              <button onClick={() => setActivity(null)} className="btn-ghost p-1.5"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-5">
              {activityLoading && !activity && (
                <div className="text-center text-ink-muted py-8">Loading…</div>
              )}
              {activity && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-caption">
                    <div><div className="ui-label">Workspace</div><div className="mt-0.5">{activity.workspace?.name || "—"}</div></div>
                    <div><div className="ui-label">Role</div><div className="mt-0.5">{activity.user.role}</div></div>
                    <div><div className="ui-label">Last active</div><div className="mt-0.5 font-mono">
                      {activity.user.last_login_at ? new Date(activity.user.last_login_at).toLocaleString() : "Never"}
                    </div></div>
                    <div><div className="ui-label">LLM cost driven</div><div className="mt-0.5 font-mono">${activity.llm_cost_usd.toFixed(4)}</div></div>
                  </div>

                  <div>
                    <div className="text-caption font-medium mb-2">Recent actions ({activity.audit_log.length})</div>
                    {activity.audit_log.length === 0 ? (
                      <p className="text-caption text-ink-muted">No audited actions yet.</p>
                    ) : (
                      <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                        {activity.audit_log.slice(0, 50).map((a) => (
                          <div key={a.id} className="p-2.5 text-caption flex items-center justify-between gap-2">
                            <span className="font-mono">{a.action}</span>
                            <span className="text-ink-muted whitespace-nowrap">{new Date(a.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-caption font-medium mb-2">Recent LLM calls ({activity.llm_usage.length})</div>
                    {activity.llm_usage.length === 0 ? (
                      <p className="text-caption text-ink-muted">No LLM usage attributed to this user yet.</p>
                    ) : (
                      <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                        {activity.llm_usage.slice(0, 50).map((u) => (
                          <div key={u.id} className="p-2.5 text-caption flex items-center justify-between gap-2">
                            <span className="font-mono">{u.model}{u.action ? ` · ${u.action}` : ""}</span>
                            <span className="text-ink-muted whitespace-nowrap">${u.cost_usd.toFixed(4)} · {new Date(u.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
