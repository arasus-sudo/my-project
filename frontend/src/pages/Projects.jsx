import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Plus, Search, Kanban as KanbanIcon, List as ListIcon, LayoutGrid,
  AlertTriangle, CheckCircle2, CircleDashed,
} from "../icons";
import { EmptyState } from "../components/composites/EmptyState";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import SegmentedControl from "../components/primitives/SegmentedControl";
import KanbanBoard from "../components/projects/KanbanBoard";
import TaskList from "../components/projects/TaskList";
import TaskDrawer from "../components/projects/TaskDrawer";
import NewProjectModal from "../components/projects/NewProjectModal";

/* Projects — agentic work management. Left rail lists projects; the main pane
 * renders one project's board or list. All edits flow through TaskDrawer /
 * drag-drop and refresh the local arrays — no global store needed at this size.
 */

const railItem = (active) => ({
  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
  height: 36, padding: "0 10px", borderRadius: "var(--radius-md)",
  fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: "var(--font-ui)",
  color: active ? "var(--color-primary)" : "var(--text-secondary)",
  background: active ? "var(--bg-selected)" : "transparent",
  border: `1px solid ${active ? "var(--color-primary-border)" : "transparent"}`,
  cursor: "pointer",
});

function StatChip({ icon: Icon, label, value, tone = "neutral" }) {
  const color = tone === "danger" ? "var(--color-danger)"
    : tone === "success" ? "var(--color-success)" : "var(--text-secondary)";
  return (
    <span className="inline-flex items-center gap-1.5" style={{
      height: 30, padding: "0 10px", borderRadius: "var(--radius-md)",
      border: "1px solid var(--border-default)", background: "var(--bg-surface)",
      fontSize: 12.5, fontFamily: "var(--font-ui)",
    }}>
      <Icon size={13} strokeWidth={1.5} aria-hidden="true" style={{ color }} />
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="tnum" style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
        {value}
      </span>
    </span>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [view, setView] = useState("kanban");
  const [q, setQ] = useState("");
  const [assignee, setAssignee] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [openTask, setOpenTask] = useState(null);
  const [newOpen, setNewOpen] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const { data } = await api.get("/projects");
      setProjects(data || []);
      return data || [];
    } catch {
      setProjects([]);
      return [];
    }
  }, []);

  const loadTasks = useCallback(async (pid) => {
    if (!pid) { setTasks([]); return; }
    try {
      const [{ data: proj }, { data: rows }] = await Promise.all([
        api.get(`/projects/${pid}`),
        api.get(`/projects/${pid}/tasks`),
      ]);
      setProject(proj);
      setTasks(rows || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not load project");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const list = await loadProjects();
      if (list.length) setSelectedId((cur) => cur || list[0].id);
    })();
    api.get("/team").then((r) => setTeam(r.data || [])).catch(() => {});
  }, [loadProjects]);

  useEffect(() => { loadTasks(selectedId); }, [selectedId, loadTasks]);

  const refreshCounts = () => loadProjects();

  const createQuickTask = async () => {
    const title = quickTitle.trim();
    if (!title || !selectedId) return;
    try {
      await api.post(`/projects/${selectedId}/tasks`, { title });
      setQuickTitle("");
      loadTasks(selectedId);
      refreshCounts();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not add task");
    }
  };

  const moveTask = async (task, status) => {
    // Optimistic: boards feel dead without it. Roll back on failure.
    setTasks((rows) => rows.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await api.put(`/projects/${selectedId}/tasks/${task.id}`, { status });
      loadTasks(selectedId);
      refreshCounts();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Move failed");
      setTasks((rows) => rows.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
    }
  };

  const onTaskChanged = (updated) => {
    setTasks((rows) => rows.map((t) => (t.id === updated.id ? updated : t)));
    refreshCounts();
  };
  const onTaskDeleted = (id) => {
    setOpenTask(null);
    setTasks((rows) => rows.filter((t) => t.id !== id));
    loadTasks(selectedId);
    refreshCounts();
  };

  const visibleTasks = useMemo(() => {
    let rows = tasks;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((t) =>
        t.title.toLowerCase().includes(needle) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(needle)));
    }
    if (assignee) rows = rows.filter((t) => (assignee === "__un" ? !t.assignee_id : t.assignee_id === assignee));
    return rows;
  }, [tasks, q, assignee]);

  const stats = project?.stats;

  if (projects === null) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Projects" subtitle="Plan and run work across every agent." />
        <div className="px-6 sm:px-8 py-6 text-center py-12" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col" style={{ height: "100vh" }}>
      <PageHeader title="Projects" subtitle="Plan and run work across every agent." />

      <div className="flex flex-1 min-h-0 px-6 sm:px-8 pb-6 gap-4">
        {/* Project rail */}
        <aside className="hidden md:flex flex-col shrink-0 scrollbar-thin overflow-y-auto"
          style={{ width: 240, borderRight: "1px solid var(--border-default)", paddingRight: 12 }}>
          <Button variant="primary" size="sm" icon={Plus} className="w-full justify-center"
            onClick={() => setNewOpen(true)} data-testid="proj-new-btn">
            New project
          </Button>
          <div className="flex flex-col gap-0.5" style={{ marginTop: 12 }}>
            {projects.map((p) => (
              <button key={p.id} type="button" onClick={() => setSelectedId(p.id)}
                data-testid={`proj-item-${p.id}`} style={railItem(p.id === selectedId)}>
                <LayoutGrid size={14} strokeWidth={1.5} aria-hidden="true" style={{
                  color: p.id === selectedId ? "var(--color-primary)" : "var(--text-tertiary)", flexShrink: 0,
                }} />
                <span className="truncate flex-1">{p.name}</span>
                {p.stats && p.stats.open > 0 && (
                  <span className="tnum" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                    {p.stats.open}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Main */}
        {!project ? (
          <div className="flex-1 grid place-items-center">
            {projects.length === 0 ? (
              <EmptyState
                icon={LayoutGrid}
                title="No projects yet"
                description="Create your first project to plan work with kanban, tasks, and comments."
                action={<Button variant="primary" size="sm" icon={Plus} onClick={() => setNewOpen(true)} data-testid="proj-empty-create">New project</Button>}
              />
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Select a project…</div>
            )}
          </div>
        ) : (
          <main className="flex-1 min-w-0 flex flex-col">
            {/* Header row */}
            <div className="flex items-center gap-3 flex-wrap">
              <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
                {project.name}
              </h2>
              <span className="tnum" style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", padding: "1px 6px" }}>
                {project.key}
              </span>
            </div>
            {project.description && (
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2 }}>{project.description}</p>
            )}

            {stats && (
              <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
                <StatChip icon={CircleDashed} label="Open" value={stats.open} />
                <StatChip icon={CheckCircle2} label="Done" value={stats.done} tone="success" />
                {stats.overdue > 0 && <StatChip icon={AlertTriangle} label="Overdue" value={stats.overdue} tone="danger" />}
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 12 }}>
              <SegmentedControl
                value={view} onChange={setView}
                options={[
                  { value: "kanban", label: "Kanban" },
                  { value: "list", label: "List" },
                ]}
              />
              <Input leadingIcon={Search} size="sm" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Filter by title or tag…" className="w-56" data-testid="proj-search" />
              <Select size="sm" placeholder="Everyone"
                options={[
                  { value: "", label: "Everyone" },
                  ...team.map((m) => ({ value: m.id, label: m.name || m.email })),
                  { value: "__un", label: "Unassigned" },
                ]}
                value={assignee} onChange={setAssignee} className="w-40" />
              <div className="ml-auto">
                <Button variant="primary" size="sm" icon={Plus}
                  onClick={() => { document.getElementById("proj-quick-add")?.focus(); }}
                  data-testid="proj-add-task-btn">
                  New task
                </Button>
              </div>
            </div>

            {/* Quick add */}
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <Input id="proj-quick-add" size="sm" value={quickTitle} className="w-80"
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createQuickTask(); }}
                placeholder="Quick-add a task to the first column…" data-testid="proj-quick-add" />
              {quickTitle.trim() && (
                <Button variant="secondary" size="sm" onClick={createQuickTask}>Add</Button>
              )}
            </div>

            {/* Board / list */}
            <div className="flex-1 min-h-0" style={{ marginTop: 10 }}>
              {visibleTasks.length === 0 && tasks.length === 0 ? (
                <EmptyState
                  icon={view === "kanban" ? KanbanIcon : ListIcon}
                  title="No tasks yet"
                  description="Quick-add above, or open a task to add subtasks and comments."
                />
              ) : visibleTasks.length === 0 ? (
                <EmptyState icon={Search} title="No matches" description="Adjust the filters to see more tasks." />
              ) : view === "kanban" ? (
                <KanbanBoard project={project} tasks={visibleTasks}
                  nowIso={new Date().toISOString()}
                  onMove={moveTask} onOpen={setOpenTask} />
              ) : (
                <TaskList tasks={visibleTasks} nowIso={new Date().toISOString()} onOpen={setOpenTask} />
              )}
            </div>
          </main>
        )}
      </div>

      {openTask && project && (
        <TaskDrawer
          project={project}
          task={openTask}
          team={team}
          onClose={() => setOpenTask(null)}
          onChanged={onTaskChanged}
          onDeleted={onTaskDeleted}
        />
      )}

      {newOpen && (
        <NewProjectModal
          onClose={() => setNewOpen(false)}
          onCreated={async (p) => {
            setNewOpen(false);
            await loadProjects();
            setSelectedId(p.id);
            setView("kanban");
          }}
        />
      )}
    </div>
  );
}
