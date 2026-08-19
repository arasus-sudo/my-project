/* Per-block editor components for the email template maker.
 * Each receives ({ data, onChange }) and patches its own slice of block data. */

import Input from "../primitives/Input";
import Select from "../primitives/Select";

const field = (key) => (data, v) => ({ ...data, [key]: v });

function ValueBlock({ label, rows, help, placeholder, data, onChange, testid }) {
  return (
    <Input
      as="textarea"
      rows={rows}
      label={label}
      help={help}
      value={data.value || ""}
      onChange={(e) => onChange(field("value")(data, e.target.value))}
      placeholder={placeholder}
      data-testid={testid}
    />
  );
}

export function GreetingBlock(props) {
  return <ValueBlock label="Greeting" rows={1} placeholder="Hey {{first_name}}," testid="tmpl-greeting" {...props} />;
}

export function OpeningBlock(props) {
  return <ValueBlock label="Opening line" rows={2} help="One sentence — the hook. Personalize it." placeholder="Quick one for {{company}}…" testid="tmpl-opening" {...props} />;
}

export function BodyBlock(props) {
  return <ValueBlock label="Body" rows={3} help="The message itself. {{industry_pain_point}} works well here." placeholder="Write the paragraph…" testid="tmpl-body" {...props} />;
}

export function ProofBlock({ data, onChange }) {
  return (
    <div className="space-y-2">
      <Input
        label="Stat to highlight"
        value={data.highlight || ""}
        onChange={(e) => onChange(field("highlight")(data, e.target.value))}
        placeholder="43%"
        data-testid="tmpl-proof-highlight"
      />
      <Input
        as="textarea"
        rows={2}
        label="Context line"
        value={data.value || ""}
        onChange={(e) => onChange(field("value")(data, e.target.value))}
        placeholder="of finance teams still run AP on spreadsheets."
        data-testid="tmpl-proof-value"
      />
    </div>
  );
}

export function CtaBlock({ data, onChange }) {
  return (
    <div className="space-y-2">
      <Select
        label="Style"
        options={[
          { value: "button", label: "Accent button" },
          { value: "link", label: "Plain text link" },
        ]}
        value={data.type === "link" ? "link" : "button"}
        onChange={(v) => onChange(field("type")(data, v))}
        data-testid="tmpl-cta-type"
      />
      <Input
        label="Button / link label"
        value={data.label || ""}
        onChange={(e) => onChange(field("label")(data, e.target.value))}
        placeholder="Book a 15-min call"
        data-testid="tmpl-cta-label"
      />
      <Input
        label="Destination"
        value={data.href || ""}
        onChange={(e) => onChange(field("href")(data, e.target.value))}
        placeholder="https://calendly.com/… or {{calendly_link}}"
        data-testid="tmpl-cta-href"
      />
    </div>
  );
}

export function SignatureBlock({ data, onChange, signatures }) {
  const options = [
    { value: "default", label: "Workspace default signature" },
    ...(signatures || []).map((s) => ({ value: s.id, label: s.name || "Untitled signature" })),
  ];
  return (
    <Select
      label="Signature"
      help="Pulled from your saved signature library — name, title, contact. No booking link per style."
      options={options}
      value={data.signature_id || "default"}
      onChange={(v) => onChange(field("signature_id")(data, v))}
      data-testid="tmpl-signature-select"
    />
  );
}

export function DividerBlock() {
  return (
    <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
      A thin separator line. Useful before the signature.
    </p>
  );
}
