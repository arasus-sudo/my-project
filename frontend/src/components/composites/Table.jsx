import { ArrowUp, ArrowDown, ArrowUpDown } from "../../icons";
import Checkbox from "../primitives/Checkbox";

/* Table — docs/design-system.md §11.
 *
 * Card-contained (0 body padding, table fills to the rounded edges), 48px
 * rows, no zebra striping, hover-only row actions, and a bulk-selection
 * toolbar that REPLACES the header rather than stacking above it (§11's
 * explicit rule) — done here by swapping thead content on `selectedCount`.
 *
 * This owns layout/behaviour only. Column definitions and cell rendering
 * stay with the caller: `columns: [{ key, label, align, sortable, render }]`.
 */

export default function Table({
  columns,
  rows,
  rowKey = (r) => r.id,
  sortKey,
  sortDir,
  onSort,
  selectable = false,
  selected = [],
  onSelectRow,
  onSelectAll,
  onRowClick,
  bulkActions,
  density = "default", // "default" (48px) | "compact" (44px)
  className = "",
}) {
  const rowHeight = density === "compact" ? 44 : 48;
  const selectedCount = selected.length;
  const allSelected = selectable && rows.length > 0 && selectedCount === rows.length;

  return (
    <div
      className={className}
      style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-xs)", overflow: "hidden",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            {selectedCount > 0 ? (
              <tr style={{ height: 40, background: "var(--color-primary-subtle)" }}>
                <td colSpan={columns.length + 1} style={{ padding: "0 16px" }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
                      {selectedCount} selected
                    </span>
                    <div className="flex items-center gap-3">
                      {bulkActions}
                      <button
                        type="button"
                        onClick={() => onSelectAll?.(false)}
                        style={{ fontSize: 12.5, color: "var(--text-secondary)", textDecoration: "underline" }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <tr style={{ height: 40, background: "var(--bg-surface-sunken)", borderBottom: "1px solid var(--border-default)" }}>
                {selectable && (
                  <th style={{ width: 40, paddingLeft: 20 }}>
                    <Checkbox checked={allSelected} onChange={(e) => onSelectAll?.(e.target.checked)} />
                  </th>
                )}
                {columns.map((col, i) => (
                  <th
                    key={col.key}
                    aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    style={{
                      padding: "0 16px",
                      paddingLeft: i === 0 && !selectable ? 20 : 16,
                      paddingRight: i === columns.length - 1 ? 20 : 16,
                      textAlign: col.align === "right" ? "right" : "left",
                      fontSize: 11.5, fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-ui)",
                    }}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort?.(col.key)}
                        className="inline-flex items-center gap-1"
                        style={{ color: sortKey === col.key ? "var(--text-primary)" : "var(--text-secondary)" }}
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === "asc" ? <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" /> : <ArrowDown size={14} strokeWidth={1.5} aria-hidden="true" />
                        ) : (
                          <ArrowUpDown size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)" }} />
                        )}
                      </button>
                    ) : col.label}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const key = rowKey(row);
              const isSelected = selected.includes(key);
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className="ds-table-row"
                  data-selected={isSelected || undefined}
                  style={{
                    height: rowHeight,
                    borderBottom: ri < rows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    cursor: onRowClick ? "pointer" : "default",
                  }}
                >
                  {selectable && (
                    <td style={{ width: 40, paddingLeft: 20 }} onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onChange={() => onSelectRow?.(key)} />
                    </td>
                  )}
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={col.numeric ? "tnum" : undefined}
                      style={{
                        padding: "0 16px",
                        paddingLeft: i === 0 && !selectable ? 20 : 16,
                        paddingRight: i === columns.length - 1 ? 20 : 16,
                        textAlign: col.align === "right" ? "right" : "left",
                        fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-ui)",
                        maxWidth: col.maxWidth,
                        overflow: col.maxWidth ? "hidden" : undefined,
                        textOverflow: col.maxWidth ? "ellipsis" : undefined,
                        whiteSpace: col.maxWidth ? "nowrap" : undefined,
                      }}
                      title={col.maxWidth && typeof row[col.key] === "string" ? row[col.key] : undefined}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TableFooter({ page, pageCount, total, pageSize, onPageChange, className = "" }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className={`flex items-center justify-between ${className}`} style={{
      height: 48, padding: "0 20px", borderTop: "1px solid var(--border-default)",
    }}>
      <span className="tnum" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
        Showing {from} to {to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", color: page <= 1 ? "var(--text-disabled)" : "var(--text-secondary)" }}
        >
          ‹
        </button>
        {Array.from({ length: pageCount }, (_, i) => i + 1).slice(0, 5).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className="tnum"
            style={{
              width: 28, height: 28, borderRadius: "var(--radius-sm)", fontSize: 12,
              background: p === page ? "var(--color-primary)" : "transparent",
              color: p === page ? "#FFFFFF" : "var(--text-secondary)",
            }}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", color: page >= pageCount ? "var(--text-disabled)" : "var(--text-secondary)" }}
        >
          ›
        </button>
      </div>
    </div>
  );
}
