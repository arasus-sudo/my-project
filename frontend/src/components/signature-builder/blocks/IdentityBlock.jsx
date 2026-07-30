export default function IdentityBlock({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value });
  return (
    <div className="grid grid-cols-2 gap-2">
      <input value={data.name || ""} onChange={set("name")} placeholder="Full name"
        className="border border-line rounded-lg px-3 py-2 text-input" data-testid="sig-field-name" />
      <input value={data.title || ""} onChange={set("title")} placeholder="Job title"
        className="border border-line rounded-lg px-3 py-2 text-input" />
      <input value={data.company || ""} onChange={set("company")} placeholder="Company"
        className="border border-line rounded-lg px-3 py-2 text-input" />
      <input value={data.department || ""} onChange={set("department")} placeholder="Department (optional)"
        className="border border-line rounded-lg px-3 py-2 text-input" />
    </div>
  );
}
