export default function DividerBlock({ data, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-caption text-ink-muted">
        Style
        <select value={data.style || "solid"} onChange={(e) => onChange({ ...data, style: e.target.value })}
          className="border border-line rounded-lg px-2 py-1 text-caption">
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
        </select>
      </label>
      <div className="flex-1 border-t" style={{ borderStyle: data.style || "solid", borderColor: "#e5e7eb" }} />
    </div>
  );
}
