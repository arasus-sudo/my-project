import RichEmailEditor from "../../RichEmailEditor";

const SNIPPETS = [
  {
    label: "Confidentiality notice",
    text: "<p>This email and any attachments are confidential and intended solely for the addressee. If you received this in error, please notify the sender and delete it.</p>",
  },
  {
    label: "GDPR notice",
    text: "<p>We process your data in accordance with GDPR. Contact us to access, correct, or delete your personal data.</p>",
  },
  {
    label: "Environmental note",
    text: "<p>Please consider the environment before printing this email.</p>",
  },
];

export default function LegalBlock({ data, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {SNIPPETS.map((s) => (
          <button key={s.label} onClick={() => onChange({ ...data, html: (data.html || "") + s.text })}
            className="btn-secondary text-tiny px-2 py-1">
            + {s.label}
          </button>
        ))}
      </div>
      <RichEmailEditor value={data.html || ""} onChange={(html) => onChange({ ...data, html })}
        placeholder="Disclaimer or legal notice…" showMergeFields={false} />
    </div>
  );
}
