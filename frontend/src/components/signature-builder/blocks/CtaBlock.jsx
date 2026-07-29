export default function CtaBlock({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value });
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input value={data.label || ""} onChange={set("label")} placeholder="Button text, e.g. Book a meeting"
        className="flex-1 min-w-[140px] border border-line rounded-lg px-3 py-2 text-input" />
      <input value={data.url || ""} onChange={set("url")} placeholder="https://…"
        className="flex-1 min-w-[140px] border border-line rounded-lg px-3 py-2 text-input" />
      <select value={data.style || "filled"} onChange={set("style")}
        className="border border-line rounded-lg px-2 py-2 text-caption">
        <option value="filled">Filled</option>
        <option value="outline">Outline</option>
      </select>
    </div>
  );
}
