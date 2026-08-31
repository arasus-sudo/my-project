/**
 * AudiencePicker — shared lead selection component.
 *
 * Lemlist-style audience selection:
 *  - Browse by lead lists (CRM lists)
 *  - Search across all leads
 *  - Filter by tags
 *  - Select individual leads or "select first N"
 *  - Show lead count and selection summary
 *  - Paginated lead rows
 *
 * Props:
 *  - selectedLeads: string[] — currently selected lead IDs
 *  - onSelect: (ids: string[]) => void — callback when selection changes
 *  - onClose: () => void — close the picker
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../../lib/api";
import {
  Search, X, Check, ChevronDown, List, Tag, Users,
  Loader2, CheckCircle2, ArrowRight,
} from "lucide-react";

const LEADS_PAGE_SIZE = 30;

export default function AudiencePicker({ selectedLeads = [], onSelect, onClose }) {
  const [leads, setLeads] = useState([]);
  const [leadLists, setLeadLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [page, setPage] = useState(1);
  const [selectN, setSelectN] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/leads?page_size=5000").then((r) => setLeads(r.data.items || r.data)),
      api.get("/crm/lists").then((r) => setLeadLists(r.data || [])).catch(() => {}),
    ]).then(() => setLoading(false)).catch(() => setLoading(false));
  }, []);

  // Extract all unique tags
  useEffect(() => {
    const tagSet = new Set();
    leads.forEach((l) => (l.tags || []).forEach((t) => tagSet.add(t)));
    setAllTags([...tagSet].sort());
  }, [leads]);

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (search) {
        const q = search.toLowerCase();
        const match = [l.first_name, l.last_name, l.email, l.company, l.title].some(
          (f) => f?.toLowerCase().includes(q)
        );
        if (!match) return false;
      }
      if (selectedListId) {
        const list = leadLists.find((lst) => lst.id === selectedListId);
        if (list && !(list.lead_ids || []).includes(l.id)) return false;
      }
      if (selectedTags.length > 0) {
        const leadTags = new Set(l.tags || []);
        if (!selectedTags.some((t) => leadTags.has(t))) return false;
      }
      return true;
    });
  }, [leads, search, selectedListId, selectedTags, leadLists]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PAGE_SIZE));
  const paginatedLeads = useMemo(
    () => filteredLeads.slice((page - 1) * LEADS_PAGE_SIZE, page * LEADS_PAGE_SIZE),
    [filteredLeads, page]
  );

  // Reset page on filter change
  useEffect(() => setPage(1), [search, selectedListId, selectedTags]);

  const toggleLead = useCallback((leadId) => {
    onSelect(
      selectedLeads.includes(leadId)
        ? selectedLeads.filter((id) => id !== leadId)
        : [...selectedLeads, leadId]
    );
  }, [selectedLeads, onSelect]);

  const toggleAll = useCallback(() => {
    const pageIds = paginatedLeads.map((l) => l.id);
    const allSelected = pageIds.every((id) => selectedLeads.includes(id));
    if (allSelected) {
      onSelect(selectedLeads.filter((id) => !pageIds.includes(id)));
    } else {
      onSelect([...new Set([...selectedLeads, ...pageIds])]);
    }
  }, [paginatedLeads, selectedLeads, onSelect]);

  const selectFirstN = useCallback(() => {
    const n = parseInt(selectN, 10);
    if (!n || n < 1) return;
    onSelect(filteredLeads.slice(0, n).map((l) => l.id));
    setSelectN("");
  }, [filteredLeads, selectN, onSelect]);

  const allPageSelected = paginatedLeads.length > 0 && paginatedLeads.every((l) => selectedLeads.includes(l.id));
  const somePageSelected = paginatedLeads.some((l) => selectedLeads.includes(l.id));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 680, maxHeight: "85vh", borderRadius: "var(--radius-xl)",
        background: "var(--bg-surface)", border: "1px solid var(--border-default)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", margin: 0 }}>
              Select audience
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
              {selectedLeads.length} lead{selectedLeads.length === 1 ? "" : "s"} selected · {filteredLeads.length} matching
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: "var(--radius-md)", border: "none",
            background: "var(--bg-surface-sunken)", color: "var(--text-tertiary)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 8, alignItems: "center" }}>
          {/* Search */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)", background: "var(--bg-surface)",
          }}>
            <Search size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, company..."
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontSize: 12, color: "var(--text-primary)", fontFamily: "var(--font-ui)",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{
                border: "none", background: "none", padding: 2, cursor: "pointer", color: "var(--text-tertiary)",
              }}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Lead list filter */}
          {leadLists.length > 0 && (
            <select
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
              style={{
                padding: "6px 10px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)", fontSize: 12,
                color: "var(--text-primary)", background: "var(--bg-surface)",
                fontFamily: "var(--font-ui)", maxWidth: 160,
              }}
            >
              <option value="">All leads</option>
              {leadLists.map((lst) => (
                <option key={lst.id} value={lst.id}>{lst.name} ({lst.lead_ids?.length || 0})</option>
              ))}
            </select>
          )}
        </div>

        {/* Tags filter */}
        {allTags.length > 0 && (
          <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 4, flexWrap: "wrap" }}>
            {allTags.slice(0, 12).map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  setSelectedTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                  );
                }}
                style={{
                  padding: "3px 10px", borderRadius: "var(--radius-full)",
                  border: "1px solid", cursor: "pointer", fontSize: 11, fontWeight: 500,
                  borderColor: selectedTags.includes(tag) ? "var(--color-primary)" : "var(--border-default)",
                  background: selectedTags.includes(tag) ? "var(--color-primary-subtle)" : "transparent",
                  color: selectedTags.includes(tag) ? "var(--color-primary)" : "var(--text-tertiary)",
                  transition: "all 100ms ease",
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Select first N */}
        <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Select first</span>
          <input
            type="number" min={1} value={selectN}
            onChange={(e) => setSelectN(e.target.value)}
            placeholder="N"
            style={{
              width: 60, padding: "4px 8px", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)", fontSize: 12,
              fontFamily: "var(--font-mono)", textAlign: "center",
            }}
            onKeyDown={(e) => { if (e.key === "Enter") selectFirstN(); }}
          />
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>leads</span>
          <button onClick={selectFirstN} disabled={!selectN} style={{
            padding: "4px 10px", borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-primary)", background: selectN ? "var(--color-primary-subtle)" : "transparent",
            color: selectN ? "var(--color-primary)" : "var(--text-disabled)",
            fontSize: 11, fontWeight: 500, cursor: selectN ? "pointer" : "default",
          }}>
            Select
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => onSelect([])} style={{
            padding: "4px 10px", borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-default)", background: "transparent",
            color: "var(--text-tertiary)", fontSize: 11, cursor: "pointer",
          }}>
            Clear all
          </button>
        </div>

        {/* Lead list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
              <Loader2 size={18} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
            </div>
          ) : paginatedLeads.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No leads match your filters
            </div>
          ) : (
            <>
              {/* Select all header */}
              <div
                onClick={toggleAll}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 20px",
                  cursor: "pointer", borderBottom: "1px solid var(--border-subtle)",
                  background: somePageSelected ? "var(--color-primary-subtle)" : "transparent",
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: 4,
                  border: `1.5px solid ${allPageSelected ? "var(--color-primary)" : "var(--border-default)"}`,
                  background: allPageSelected ? "var(--color-primary)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 100ms ease",
                }}>
                  {allPageSelected && <Check size={10} style={{ color: "#fff" }} />}
                </div>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  Select all on this page ({paginatedLeads.length})
                </span>
              </div>

              {/* Lead rows */}
              {paginatedLeads.map((lead) => {
                const isSelected = selectedLeads.includes(lead.id);
                return (
                  <div
                    key={lead.id}
                    onClick={() => toggleLead(lead.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 20px", cursor: "pointer",
                      borderBottom: "1px solid var(--border-subtle)",
                      background: isSelected ? "var(--color-primary-subtle)" : "transparent",
                      transition: "background 80ms ease",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 16, height: 16, borderRadius: 4,
                      border: `1.5px solid ${isSelected ? "var(--color-primary)" : "var(--border-default)"}`,
                      background: isSelected ? "var(--color-primary)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, transition: "all 100ms ease",
                    }}>
                      {isSelected && <Check size={10} style={{ color: "#fff" }} />}
                    </div>

                    {/* Lead info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {lead.first_name} {lead.last_name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {lead.email}
                      </div>
                    </div>

                    {/* Company & title */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {lead.company && (
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{lead.company}</div>
                      )}
                      {lead.title && (
                        <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{lead.title}</div>
                      )}
                    </div>

                    {/* Tags */}
                    {lead.tags?.length > 0 && (
                      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                        {lead.tags.slice(0, 2).map((tag) => (
                          <span key={tag} style={{
                            padding: "1px 6px", borderRadius: "var(--radius-full)",
                            background: "var(--bg-surface-sunken)", fontSize: 9,
                            color: "var(--text-tertiary)", fontFamily: "var(--font-mono)",
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: "8px 20px", borderTop: "1px solid var(--border-subtle)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} style={{
              padding: "4px 10px", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)", background: "var(--bg-surface)",
              color: page === 1 ? "var(--text-disabled)" : "var(--text-secondary)",
              fontSize: 11, cursor: page === 1 ? "default" : "pointer",
            }}>
              Prev
            </button>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              {page} / {totalPages}
            </span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} style={{
              padding: "4px 10px", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)", background: "var(--bg-surface)",
              color: page >= totalPages ? "var(--text-disabled)" : "var(--text-secondary)",
              fontSize: 11, cursor: page >= totalPages ? "default" : "pointer",
            }}>
              Next
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {selectedLeads.length > 0 ? (
              <><strong style={{ color: "var(--color-primary)" }}>{selectedLeads.length}</strong> lead{selectedLeads.length === 1 ? "" : "s"} selected</>
            ) : (
              "No leads selected"
            )}
          </span>
          <button onClick={onClose} className="btn-primary" style={{
            padding: "7px 18px", fontSize: 12, display: "flex", alignItems: "center", gap: 5,
          }}>
            <CheckCircle2 size={13} /> Confirm selection
          </button>
        </div>
      </div>
    </div>
  );
}
