import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { api } from "../../lib/api";
import { toast } from "sonner";
import Button from "../primitives/Button";
import Input from "../primitives/Input";
import { Plus, Trash2, FileText } from "../../icons";
import { EmptyState } from "../composites/EmptyState";

/* DocsView — TipTap editor for project docs. Left: flat list of docs.
 * Right: title input + rich editor. Auto-saves on blur / 2s debounce.
 */

function Tiptap({ content, onUpdate }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: content || "<p></p>",
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
  });
  useEffect(() => {
    if (editor && content !== editor.getHTML()) editor.commands.setContent(content || "<p></p>");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);
  if (!editor) return null;
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <div className="flex items-center gap-1" style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface-sunken)" }}>
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} style={{ padding: "4px 8px", fontSize: 12, fontWeight: editor.isActive("bold") ? 700 : 400, background: editor.isActive("bold") ? "var(--bg-selected)" : "transparent", borderRadius: "var(--radius-sm)" }}><b>B</b></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} style={{ padding: "4px 8px", fontSize: 12, fontStyle: "italic", background: editor.isActive("italic") ? "var(--bg-selected)" : "transparent", borderRadius: "var(--radius-sm)" }}>I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} style={{ padding: "4px 8px", fontSize: 12, background: editor.isActive("bulletList") ? "var(--bg-selected)" : "transparent", borderRadius: "var(--radius-sm)" }}>• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} style={{ padding: "4px 8px", fontSize: 12, background: editor.isActive("heading", { level: 2 }) ? "var(--bg-selected)" : "transparent", borderRadius: "var(--radius-sm)" }}>H2</button>
      </div>
      <EditorContent editor={editor} style={{ minHeight: 180, padding: "10px 12px" }} />
    </div>
  );
}

export default function DocsView({ project }) {
  const [docs, setDocs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get(`/projects/${project.id}/docs`);
      setDocs(data || []);
      if (data && data.length && !selectedId) {
        setSelectedId(data[0].id);
        setTitle(data[0].title);
        setContent(data[0].content || "");
      } else if (selectedId) {
        const cur = (data || []).find((d) => d.id === selectedId);
        if (cur) { setTitle(cur.title); setContent(cur.content || ""); }
      }
    } catch {}
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [project.id]);

  const select = (d) => {
    setSelectedId(d.id);
    setTitle(d.title);
    setContent(d.content || "");
  };

  const create = async () => {
    const t = newTitle.trim();
    if (!t) return;
    try {
      const { data } = await api.post(`/projects/${project.id}/docs`, { title: t, content: "" });
      setNewTitle("");
      setDocs((prev) => [...prev, data]);
      setSelectedId(data.id);
      setTitle(data.title);
      setContent("");
    } catch (err) { toast.error(err?.response?.data?.detail || "Create failed"); }
  };

  const save = async () => {
    if (!selectedId) return;
    try {
      await api.put(`/projects/${project.id}/docs/${selectedId}`, { title, content });
      toast.success("Saved");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
  };

  const remove = async () => {
    if (!selectedId || !window.confirm("Delete this doc?")) return;
    try {
      await api.delete(`/projects/${project.id}/docs/${selectedId}`);
      setSelectedId(null);
      setTitle("");
      setContent("");
      load();
    } catch { toast.error("Delete failed"); }
  };

  const selected = docs.find((d) => d.id === selectedId);

  return (
    <div data-testid="proj-docs" className="flex gap-4" style={{ minHeight: 360 }}>
      <aside style={{ width: 200, flexShrink: 0, border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", padding: 8 }}>
        <div className="flex items-center gap-1" style={{ marginBottom: 8 }}>
          <Input size="sm" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} placeholder="New doc title…" className="flex-1" data-testid="proj-doc-new-title" />
          <Button variant="secondary" size="xs" icon={Plus} onClick={create} isDisabled={!newTitle.trim()} />
        </div>
        {docs.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: 12 }}>No docs yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {docs.map((d) => (
              <button key={d.id} type="button" onClick={() => select(d)} data-testid={`proj-doc-${d.id}`}
                className="text-left truncate" style={{
                  padding: "6px 8px", fontSize: 13, borderRadius: "var(--radius-md)",
                  background: d.id === selectedId ? "var(--bg-selected)" : "transparent",
                  color: d.id === selectedId ? "var(--color-primary)" : "var(--text-primary)",
                  border: `1px solid ${d.id === selectedId ? "var(--color-primary-border)" : "transparent"}`,
                }}>
                <span className="inline-flex items-center gap-1.5"><FileText size={13} strokeWidth={1.5} />{d.title}</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <main className="flex-1 min-w-0">
        {!selected ? (
          <EmptyState icon={FileText} title="Select a doc" description="Pick a doc from the list or create a new one." />
        ) : (
          <div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} data-testid="proj-doc-title" />
            <div style={{ marginTop: 8 }}>
              <Tiptap content={content} onUpdate={setContent} />
            </div>
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <Button variant="primary" size="sm" onClick={save} data-testid="proj-doc-save">Save</Button>
              <Button variant="danger-subtle" size="xs" icon={Trash2} onClick={remove}>Delete</Button>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Auto-save on title blur · Save button for content</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
