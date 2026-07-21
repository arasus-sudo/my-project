import { useState } from "react";
import { X, Mail, Phone, Linkedin, Globe, Building2, MapPin, Shield, ExternalLink, Copy, Check, Loader2, Star, Clock, Tag, FileText, Plus, UserPlus, Send, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

function InfoRow({ label, value, icon: Icon, href, masked }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (value && value !== "—") { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  return (
    <div className="flex items-start gap-3 py-2 group">
      {Icon && <Icon size={14} className="text-ink-muted mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ink-muted font-medium">{label}</div>
        {masked ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-muted italic">••••••••</span>
            <span className="text-xs text-accent font-medium">Reveal to view</span>
          </div>
        ) : href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-sm text-accent hover:underline inline-flex items-center gap-1">
            {value || "—"} <ExternalLink size={10} />
          </a>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink truncate">{value || "—"}</span>
            {value && value !== "—" && (
              <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-ink transition-all">
                {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line last:border-0">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-ash/30 transition-colors">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</span>
        <ChevronDownIcon size={13} className={`text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-1">{children}</div>}
    </div>
  );
}

function ChevronDownIcon({ size, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ActionButton({ icon: Icon, label, onClick, primary, danger }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
        primary ? "bg-accent text-white hover:bg-accent/90" :
        danger ? "text-red-600 hover:bg-red-50" :
        "text-ink hover:bg-ash/70"
      }`}>
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

export default function LeadPreviewPanel({ lead, onClose, onReveal, revealing, onAddToCrm }) {
  if (!lead) return null;

  const actions = [
    { icon: Mail, label: "Reveal Email", onClick: () => onReveal(lead, "email"), primary: !lead.email || lead.email === "—" || lead.email?.includes("masked") },
    { icon: Phone, label: "Reveal Phone", onClick: () => onReveal(lead, "phone"), primary: !lead.phone || lead.phone === "—" },
    { icon: UserPlus, label: "Add to CRM", onClick: onAddToCrm },
    { icon: Shield, label: "Verify Email", onClick: () => toast.info("Email verification queued") },
    { icon: Tag, label: "Add Tags", onClick: () => toast.info("Tags feature coming soon") },
    { icon: FileText, label: "Add Note", onClick: () => toast.info("Notes feature coming soon") },
    { icon: Send, label: "Assign Campaign", onClick: () => toast.info("Campaign assignment coming soon") },
    { icon: Globe, label: "Open Company", onClick: () => {
      if (lead.company_domain) window.open(`https://${lead.company_domain}`, "_blank");
      else toast.error("No company domain available");
    }},
  ];

  const loc = lead.location || {};

  return (
    <div className="h-full flex flex-col bg-white border-l border-line">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-line flex items-center justify-between">
        <span className="text-sm font-semibold">Lead Preview</span>
        <button onClick={onClose} className="btn-ghost text-xs py-1 px-2"><X size={14} /></button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Identity */}
        <div className="px-4 py-4 border-b border-line">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {(lead.first_name?.[0] || "") + (lead.last_name?.[0] || "") || "?"}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{lead.full_name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Unknown"}</div>
              <div className="text-xs text-ink-muted truncate">{lead.title || "—"}</div>
              <div className="text-xs text-ink-muted">{lead.company || "—"}</div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-3 border-b border-line grid grid-cols-2 gap-2">
          {actions.slice(0, 4).map((a) => (
            <button key={a.label} onClick={a.onClick}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                a.primary ? "bg-accent text-white hover:bg-accent/90" : "bg-ash/50 text-ink hover:bg-ash border border-line"
              }`}>
              <a.icon size={13} />
              {a.label}
            </button>
          ))}
        </div>

        {/* Contact */}
        <Section title="Contact">
          <InfoRow label="Email" value={lead.email} icon={Mail} masked={!lead.email || lead.email === "—" || lead.email?.includes("masked")} />
          <InfoRow label="Phone" value={lead.phone} icon={Phone} masked={!lead.phone || lead.phone === "—"} />
          <InfoRow label="LinkedIn" value={lead.linkedin_url} icon={Linkedin} href={lead.linkedin_url} />
          <InfoRow label="Email Status" value={lead.email_status || lead.verification_status || "Unknown"} icon={Shield} />
        </Section>

        {/* Employment */}
        <Section title="Employment">
          <InfoRow label="Current Position" value={lead.title} icon={BriefcaseIcon} />
          <InfoRow label="Company" value={lead.company} icon={Building2} />
          <InfoRow label="Seniority" value={lead.seniority || "—"} />
          <InfoRow label="Skills" value={Array.isArray(lead.skills) ? lead.skills.join(", ") : lead.skills || "—"} />
        </Section>

        {/* Company */}
        <Section title="Company">
          <InfoRow label="Industry" value={lead.company_industry || "—"} icon={Building2} />
          <InfoRow label="Company Size" value={lead.company_size || "—"} />
          <InfoRow label="Domain" value={lead.company_domain || "—"} icon={Globe} href={lead.company_domain ? `https://${lead.company_domain}` : undefined} />
          <InfoRow label="Tech Stack" value={(() => {
            const t = lead.company_technologies || lead.technologies || [];
            return Array.isArray(t) ? t.join(", ") : t || "—";
          })()} />
        </Section>

        {/* Location */}
        <Section title="Location">
          <InfoRow label="Country" value={loc.country || "—"} icon={MapPin} />
          <InfoRow label="State" value={loc.state || "—"} />
          <InfoRow label="City" value={loc.city || "—"} />
        </Section>

        {/* Metadata */}
        <Section title="Details" defaultOpen={false}>
          <InfoRow label="Source" value={lead.source_provider || "—"} />
          <InfoRow label="CRM Status" value={lead.crm_status || "new"} />
          <InfoRow label="Lead Score" value={lead.lead_score != null ? String(lead.lead_score) : "—"} />
        </Section>
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 px-4 py-3 border-t border-line grid grid-cols-4 gap-2">
        {actions.slice(4).map((a) => (
          <button key={a.label} onClick={a.onClick}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-ink-muted hover:text-ink hover:bg-ash/50 transition-colors text-xs">
            <a.icon size={14} />
            <span className="text-[10px] leading-tight text-center">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BriefcaseIcon({ size, className }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
}
