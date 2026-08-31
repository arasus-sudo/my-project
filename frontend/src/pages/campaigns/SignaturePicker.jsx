/**
 * SignaturePicker — shared signature selection component.
 *
 * Lemlist-style signature management:
 *  - Select from existing signatures
 *  - Toggle include/exclude
 *  - Create new signature inline
 *  - Preview selected signature
 *
 * Props:
 *  - signatureId: string — currently selected signature ID
 *  - onSelect: (id: string) => void
 *  - includeSignature: boolean
 *  - onToggleInclude: (val: boolean) => void
 */
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { PenSquare, Trash2, Plus, Loader2, Check } from "lucide-react";

export default function SignaturePicker({
  signatureId = "",
  onSelect,
  includeSignature = true,
  onToggleInclude,
}) {
  const [signatures, setSignatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHtml, setNewHtml] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/signatures")
      .then((r) => {
        const sigs = r.data || [];
        setSignatures(sigs);
        // Auto-select default if none selected
        if (!signatureId && sigs.length > 0) {
          const def = sigs.find((s) => s.is_default) || sigs[0];
          onSelect(def.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const createSignature = async () => {
    if (!newName.trim()) { toast.error("Name is required"); return; }
    if (!newHtml.trim()) { toast.error("Content is required"); return; }
    setSaving(true);
    try {
      const txt = newHtml.replace(/<[^>]+>/g, "").trim();
      const { data } = await api.post("/signatures", {
        name: newName, content_html: newHtml, content_text: txt,
      });
      setSignatures((prev) => [data, ...prev]);
      onSelect(data.id);
      setShowCreate(false);
      setNewName("");
      setNewHtml("");
      toast.success("Signature created");
    } catch {
      toast.error("Failed to create signature");
    }
    setSaving(false);
  };

  const deleteSignature = async (sid) => {
    if (!window.confirm("Delete this signature?")) return;
    try {
      await api.delete(`/signatures/${sid}`);
      setSignatures((prev) => prev.filter((s) => s.id !== sid));
      if (signatureId === sid) {
        const next = signatures.find((s) => s.id !== sid);
        onSelect(next?.id || "");
      }
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const selected = signatures.find((s) => s.id === signatureId);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0" }}>
        <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Loading signatures...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Toggle */}
      <label style={{
        display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8,
      }}>
        <div
          onClick={() => onToggleInclude(!includeSignature)}
          style={{
            width: 32, height: 18, borderRadius: 9, cursor: "pointer",
            background: includeSignature ? "var(--color-primary)" : "var(--border-default)",
            position: "relative", transition: "background 150ms ease",
          }}
        >
          <div style={{
            width: 14, height: 14, borderRadius: "var(--radius-full)",
            background: "#fff", position: "absolute", top: 2,
            left: includeSignature ? 16 : 2,
            transition: "left 150ms ease",
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
          Include email signature
        </span>
      </label>

      {includeSignature && (
        <>
          {/* Signature list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {signatures.map((sig) => (
              <div
                key={sig.id}
                onClick={() => onSelect(sig.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                  borderRadius: "var(--radius-md)", cursor: "pointer",
                  border: "1px solid",
                  borderColor: signatureId === sig.id ? "var(--color-primary)" : "var(--border-subtle)",
                  background: signatureId === sig.id ? "var(--color-primary-subtle)" : "transparent",
                  transition: "all 100ms ease",
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: "var(--radius-full)",
                  border: `1.5px solid ${signatureId === sig.id ? "var(--color-primary)" : "var(--border-default)"}`,
                  background: signatureId === sig.id ? "var(--color-primary)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {signatureId === sig.id && <Check size={9} style={{ color: "#fff" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{sig.name}</div>
                  {sig.content_text && (
                    <div style={{
                      fontSize: 10, color: "var(--text-tertiary)", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280,
                    }}>
                      {sig.content_text.substring(0, 80)}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSignature(sig.id); }}
                  style={{
                    border: "none", background: "none", padding: 3, cursor: "pointer",
                    color: "var(--text-disabled)", borderRadius: "var(--radius-sm)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>

          {/* Create new */}
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} style={{
              width: "100%", padding: "6px 12px", borderRadius: "var(--radius-md)",
              border: "1px dashed var(--border-default)", background: "transparent",
              cursor: "pointer", fontSize: 11, color: "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}>
              <Plus size={11} /> Create signature
            </button>
          ) : (
            <div style={{
              padding: 10, borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)", background: "var(--bg-surface-sunken)",
            }}>
              <input
                value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Signature name"
                style={{
                  width: "100%", padding: "6px 8px", borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)", fontSize: 12, outline: "none",
                  marginBottom: 6,
                }}
              />
              <textarea
                value={newHtml} onChange={(e) => setNewHtml(e.target.value)}
                placeholder="Paste HTML signature or type plain text..."
                rows={4}
                style={{
                  width: "100%", padding: "6px 8px", borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)", fontSize: 11, outline: "none",
                  resize: "vertical", fontFamily: "var(--font-mono)", lineHeight: "16px",
                }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => setShowCreate(false)} style={{
                  padding: "4px 10px", borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)", background: "transparent",
                  fontSize: 11, cursor: "pointer", color: "var(--text-tertiary)",
                }}>
                  Cancel
                </button>
                <button onClick={createSignature} disabled={saving} style={{
                  padding: "4px 10px", borderRadius: "var(--radius-sm)",
                  border: "none", background: "var(--color-primary)", color: "#fff",
                  fontSize: 11, fontWeight: 500, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
                </button>
              </div>
            </div>
          )}

          {/* Preview */}
          {selected && selected.content_html && (
            <div style={{
              marginTop: 8, padding: 10, borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)", background: "var(--bg-surface)",
            }}>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>Preview</div>
              <div dangerouslySetInnerHTML={{ __html: selected.content_html }}
                style={{ fontSize: 12, lineHeight: "18px", color: "var(--text-secondary)" }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
