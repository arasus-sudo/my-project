import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, LogOut, ArrowLeft, Lock, Trash2, RefreshCw, AlertTriangle, CheckCircle2, DollarSign, Activity, X } from "../icons";
import Card from "../components/composites/Card";
import Table from "../components/composites/Table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/composites/Tabs";
import { Modal, ModalContent } from "../components/composites/Modal";
import MetricCard from "../components/composites/MetricCard";
import StatusPill from "../components/primitives/StatusPill";
import Chip from "../components/primitives/Chip";
import Button from "../components/primitives/Button";

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

  const impersonate = async (u) => {
    try {
      const { data } = await api.post(`/admin/impersonate/${u.id}`);
      localStorage.setItem("pitcheq_token", data.token);
      localStorage.setItem("pitcheq_user", JSON.stringify(data.user));
      localStorage.setItem("pitcheq_workspace", JSON.stringify(data.workspace));
      toast.success(`Impersonating ${u.email}`);
      window.location.href = "/app";
    } catch { toast.error("Impersonation failed"); }
  };

  const wsColumns = [
    { key: "name", label: "Workspace", render: (w) => <div><div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{w.name}</div><div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{w.plan || "trial"}</div></div> },
    { key: "users", label: "Users", numeric: true, render: (w) => w.stats.users },
    { key: "campaigns", label: "Campaigns", numeric: true, render: (w) => w.stats.campaigns },
    { key: "leads", label: "Leads", numeric: true, render: (w) => w.stats.leads },
    { key: "sent", label: "Sent", numeric: true, render: (w) => w.stats.sent },
    { key: "replied", label: "Replied", numeric: true, render: (w) => w.stats.replied },
    { key: "status", label: "Status", render: (w) => <StatusPill status={w.blocked ? "blocked" : "active"} tone={w.blocked ? "danger" : "success"} /> },
    { key: "actions", label: "", align: "right", render: (w) => <Button variant="tertiary" size="sm" icon={Lock} onClick={() => toggleWs(w.id)} data-testid={`admin-ws-toggle-${w.id}`}>{w.blocked ? "Unblock" : "Block"}</Button> },
  ];

  const userColumns = [
    { key: "name", label: "User", render: (u) => <span className="inline-flex items-center gap-1.5" style={{ fontWeight: 500, color: "var(--text-primary)" }}>{u.name} {u.is_admin && <Chip label="Admin" />}</span> },
    { key: "email", label: "Email", render: (u) => <span className="tnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)" }}>{u.email}</span> },
    { key: "workspace", label: "Workspace", render: (u) => <span style={{ color: "var(--text-tertiary)" }}>{u.workspace_name || "—"}</span> },
    { key: "role", label: "Role", render: (u) => u.role },
    { key: "last_active", label: "Last active", render: (u) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never"}</span> },
    { key: "status", label: "Status", render: (u) => <StatusPill status={u.blocked ? "blocked" : "active"} tone={u.blocked ? "danger" : "success"} /> },
    {
      key: "actions", label: "", align: "right", render: (u) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button variant="tertiary" size="sm" icon={Activity} onClick={() => viewActivity(u.id)} data-testid={`admin-activity-${u.id}`}>Activity</Button>
          <Button variant="tertiary" size="sm" icon={ShieldCheck} onClick={() => impersonate(u)} data-testid={`admin-impersonate-${u.id}`}>Login as</Button>
          <Button variant="tertiary" size="sm" icon={Lock} onClick={() => toggleUser(u.id)} data-testid={`admin-user-toggle-${u.id}`}>{u.blocked ? "Unblock" : "Block"}</Button>
          {!u.is_admin && <Button variant="danger-subtle" size="sm" icon={Trash2} onClick={() => deleteUser(u.id)} data-testid={`admin-user-delete-${u.id}`}>Delete</Button>}
        </div>
      ),
    },
  ];

  const tickColumns = [
    { key: "tick_id", label: "Tick", render: (t) => <span className="tnum" style={{ fontWeight: 500, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-primary)" }}>{t.tick_id}</span> },
    { key: "last_run", label: "Last run", render: (t) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.last_run_at ? new Date(t.last_run_at).toLocaleString() : "—"}</span> },
    { key: "last_success", label: "Last success", render: (t) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.last_success_at ? new Date(t.last_success_at).toLocaleString() : "—"}</span> },
    { key: "runs", label: "Runs", numeric: true, render: (t) => t.run_count || 0 },
    { key: "errors", label: "Errors", numeric: true, render: (t) => t.error_count || 0 },
    {
      key: "last_error", label: "Last error", render: (t) => {
        const failing = t.last_error && t.last_run_at !== t.last_success_at;
        return failing ? (
          <span className="inline-flex items-center gap-1 truncate" style={{ color: "var(--color-danger)", maxWidth: 260 }}>
            <AlertTriangle size={12} strokeWidth={1.5} aria-hidden="true" /> {t.last_error}
          </span>
        ) : t.last_run_at ? (
          <span className="inline-flex items-center gap-1" style={{ color: "var(--color-success)" }}>
            <CheckCircle2 size={12} strokeWidth={1.5} aria-hidden="true" /> OK
          </span>
        ) : "—";
      },
    },
  ];

  const wsCostColumns = [
    { key: "workspace", label: "Workspace", render: (w) => <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{w.workspace_name}</span> },
    { key: "calls", label: "Calls", numeric: true, render: (w) => w.calls },
    { key: "cost", label: "Cost", numeric: true, render: (w) => <span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>${w.cost_usd.toFixed(4)}</span> },
  ];
  const modelCostColumns = [
    { key: "model", label: "Model", render: (m) => <span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>{m.model}</span> },
    { key: "calls", label: "Calls", numeric: true, render: (m) => m.calls },
    { key: "cost", label: "Cost", numeric: true, render: (m) => <span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>${m.cost_usd.toFixed(4)}</span> },
  ];
  const userCostColumns = [
    { key: "user", label: "User", render: (u) => <div><div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{u.name}</div><div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{u.email}</div></div> },
    { key: "workspace", label: "Workspace", render: (u) => <span style={{ color: "var(--text-tertiary)" }}>{u.workspace_name}</span> },
    { key: "calls", label: "Calls", numeric: true, render: (u) => u.calls },
    { key: "cost", label: "Cost", numeric: true, render: (u) => <span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>${u.cost_usd.toFixed(4)}</span> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)" }} className="animate-fade-in">
      <header style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)" }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8 flex items-center gap-4" style={{ height: 64 }}>
          <Button variant="tertiary" icon={ArrowLeft} onClick={() => nav("/app")} data-testid="admin-back-to-app">App</Button>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-primary)" }} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>Suite Admin</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="tnum" style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{user?.email}</span>
            <Button variant="tertiary" iconOnly icon={RefreshCw} onClick={load} data-testid="admin-refresh" aria-label="Refresh" />
            <Button variant="tertiary" iconOnly icon={LogOut} onClick={logout} aria-label="Log out" />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 sm:p-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" style={{ marginBottom: 24 }}>
          {summary && [
            { k: "Workspaces", v: summary.workspaces },
            { k: "Users", v: summary.users },
            { k: "Campaigns", v: `${summary.active_campaigns}/${summary.campaigns}` },
            { k: "Sent", v: summary.sent_events },
            { k: "Replies", v: summary.replied_events },
          ].map((c) => <MetricCard key={c.k} label={c.k} value={c.v} />)}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex items-center" style={{ marginBottom: 16 }}>
            <TabsList>
              <TabsTrigger value="workspaces" data-testid="admin-tab-workspaces">Workspaces</TabsTrigger>
              <TabsTrigger value="users" data-testid="admin-tab-users">Users</TabsTrigger>
              <TabsTrigger value="system" data-testid="admin-tab-system">System</TabsTrigger>
              <TabsTrigger value="cost" data-testid="admin-tab-cost">Cost</TabsTrigger>
            </TabsList>
            {busy && <span style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginLeft: 12 }}>Loading…</span>}
          </div>

          <TabsContent value="workspaces">
            <Table columns={wsColumns} rows={workspaces} rowKey={(w) => w.id} />
          </TabsContent>

          <TabsContent value="users">
            <Table columns={userColumns} rows={users} rowKey={(u) => u.id} />
          </TabsContent>

          <TabsContent value="system">
            {ticks.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xl)", background: "var(--bg-surface)" }}>No ticks have run yet.</div>
            ) : (
              <Table columns={tickColumns} rows={ticks} rowKey={(t) => t.tick_id} />
            )}
          </TabsContent>

          <TabsContent value="cost">
            <div className="space-y-4">
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                Real model token cost — what agent actions actually cost us to run, independent of the
                flat credit prices workspaces are charged. Internal COGS visibility only.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MetricCard icon={DollarSign} label="Total model cost" value={`$${(tokenUsage?.total_cost_usd ?? 0).toFixed(4)}`} />
                <MetricCard label="Model calls logged" value={tokenUsage?.total_calls ?? 0} />
              </div>

              <Card title="Cost by workspace" padding="compact" bodyClassName={(tokenUsage?.by_workspace?.length ?? 0) > 0 ? "-mx-5" : ""}>
                {(tokenUsage?.by_workspace?.length ?? 0) === 0 ? (
                  <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>No model usage logged yet.</div>
                ) : (
                  <Table columns={wsCostColumns} rows={tokenUsage.by_workspace} rowKey={(w) => w.workspace_id} />
                )}
              </Card>

              <Card title="Cost by model" padding="compact" bodyClassName={(tokenUsage?.by_model?.length ?? 0) > 0 ? "-mx-5" : ""}>
                {(tokenUsage?.by_model?.length ?? 0) === 0 ? (
                  <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>No model usage logged yet.</div>
                ) : (
                  <Table columns={modelCostColumns} rows={tokenUsage.by_model} rowKey={(m) => m.model} />
                )}
              </Card>

              <Card title="Cost by user" padding="compact" bodyClassName={(tokenUsage?.by_user?.length ?? 0) > 0 ? "-mx-5" : ""}>
                {(tokenUsage?.by_user?.length ?? 0) === 0 ? (
                  <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>No per-user model usage attributed yet.</div>
                ) : (
                  <Table columns={userCostColumns} rows={tokenUsage.by_user} rowKey={(u) => u.user_id} onRowClick={(u) => viewActivity(u.user_id)} />
                )}
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Modal open={!!(activity || activityLoading)} onOpenChange={(o) => !o && setActivity(null)}>
        <ModalContent size="lg" title={activity ? activity.user.name : "Loading…"} subtitle={activity?.user.email}>
          <div className="space-y-4">
            {activityLoading && !activity && (
              <div className="text-center" style={{ padding: 32, fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>
            )}
            {activity && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Workspace</div><div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{activity.workspace?.name || "—"}</div></div>
                  <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Role</div><div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{activity.user.role}</div></div>
                  <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Last active</div><div className="tnum" style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2, fontFamily: "var(--font-mono)" }}>{activity.user.last_login_at ? new Date(activity.user.last_login_at).toLocaleString() : "Never"}</div></div>
                  <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Model cost driven</div><div className="tnum" style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2, fontFamily: "var(--font-mono)" }}>${activity.llm_cost_usd.toFixed(4)}</div></div>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8 }}>Recent actions ({activity.audit_log.length})</div>
                  {activity.audit_log.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No audited actions yet.</p>
                  ) : (
                    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                      {activity.audit_log.slice(0, 50).map((a, i) => (
                        <div key={a.id} className="flex items-center justify-between gap-2" style={{ padding: "8px 10px", borderTop: i > 0 ? "1px solid var(--border-subtle)" : "none", fontSize: 12.5 }}>
                          <span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>{a.action}</span>
                          <span className="whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{new Date(a.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8 }}>Recent model calls ({activity.llm_usage.length})</div>
                  {activity.llm_usage.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No model usage attributed to this user yet.</p>
                  ) : (
                    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                      {activity.llm_usage.slice(0, 50).map((u, i) => (
                        <div key={u.id} className="flex items-center justify-between gap-2" style={{ padding: "8px 10px", borderTop: i > 0 ? "1px solid var(--border-subtle)" : "none", fontSize: 12.5 }}>
                          <span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>{u.model}{u.action ? ` · ${u.action}` : ""}</span>
                          <span className="whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>${u.cost_usd.toFixed(4)} · {new Date(u.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
