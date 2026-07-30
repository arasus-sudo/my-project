export default function TaglineBlock({ data, onChange }) {
  return (
    <input
      value={data.text || ""}
      onChange={(e) => onChange({ ...data, text: e.target.value })}
      placeholder="e.g. Helping teams close faster"
      maxLength={120}
      className="w-full border border-line rounded-lg px-3 py-2 text-input"
      data-testid="sig-field-tagline"
    />
  );
}
