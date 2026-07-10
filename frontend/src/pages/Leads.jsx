import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import ProspectFinder from "../components/ProspectFinder";
import { toast } from "sonner";
import { Plus, Upload, Sparkles } from "lucide-react";

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const [finder, setFinder] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", company: "", title: "" });

  const load = () => api.get("/leads").then((r) => setLeads(r.data));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/leads", form);
      toast.success("Lead added");
      setModal(false);
      setForm({ first_name: "", last_name: "", email: "", company: "", title: "" });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const importCsv = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = ""; // allow re-selecting same file
    let text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM

    // RFC 4180-ish CSV parse (quotes with commas + doubled quotes)
    const parseLine = (line) => {
      const out = []; let cur = ""; let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') { q = false; }
          else cur += ch;
        } else {
          if (ch === '"') q = true;
          else if (ch === ",") { out.push(cur); cur = ""; }
          else cur += ch;
        }
      }
      out.push(cur);
      return out.map((v) => v.trim());
    };

    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast.error("CSV needs a header row and at least one data row"); return; }

    const norm = (k) => k.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const cols = parseLine(lines[0]).map(norm);
    const HEADER_MAP = {
      first_name: ["first_name", "firstname", "first", "given_name", "fname"],
      last_name: ["last_name", "lastname", "last", "family_name", "surname", "lname"],
      email: ["email", "email_address", "e_mail", "mail"],
      company: ["company", "company_name", "organization", "org", "account"],
      title: ["title", "job_title", "role", "position"],
    };
    const idx = {};
    for (const [k, aliases] of Object.entries(HEADER_MAP)) {
      idx[k] = cols.findIndex((c) => aliases.includes(c));
    }
    if (idx.email === -1) { toast.error("CSV must include an 'email' column"); return; }

    const items = [];
    for (let li = 1; li < lines.length; li++) {
      const vals = parseLine(lines[li]);
      const get = (k) => (idx[k] !== -1 ? (vals[idx[k]] || "") : "").trim();
      const email = get("email").toLowerCase();
      let first = get("first_name");
      // fallback: split "Full Name" style
      if (!first) {
        const full = (vals.find((v) => v && v.includes(" ")) || "").trim();
        if (full) { const [f, ...rest] = full.split(/\s+/); first = f; if (!get("last_name")) vals.push(rest.join(" ")); }
      }
      if (!email || !first) continue;
      items.push({
        first_name: first,
        last_name: get("last_name"),
        email,
        company: get("company"),
        title: get("title"),
      });
    }
    if (!items.length) { toast.error("No valid rows found. Need first_name + email at minimum."); return; }
    try {
      const { data } = await api.post("/leads/bulk", { leads: items });
      toast.success(`Imported ${data.added} · skipped ${data.skipped} duplicate(s)`);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Import failed"); }
  };

  const remove = async (id) => {
    await api.delete(`/leads/${id}`);
    load();
  };
  const suppress = async (email) => {
    await api.post("/suppressions", { email });
    toast.success(`Suppressed ${email}`);
  };

  const filtered = leads.filter((l) =>
    !q || `${l.first_name} ${l.last_name} ${l.email} ${l.company}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={`${leads.length} contacts in your workspace.`}
        right={
          <div className="flex gap-2">
            <button onClick={() => setFinder(true)} data-testid="find-leads-btn" className="btn-secondary">
              <Sparkles size={14} /> Find leads
            </button>
            <label className="btn-secondary cursor-pointer" data-testid="import-csv-btn">
              <Upload size={14} /> Import CSV
              <input type="file" accept=".csv" hidden onChange={importCsv} data-testid="csv-file-input" />
            </label>
            <button onClick={() => setModal(true)} data-testid="add-lead-btn" className="btn-primary"><Plus size={14} /> Add lead</button>
          </div>
        }
      />
      <div className="p-6">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} data-testid="lead-search"
          placeholder="Search leads by name, email, company…"
          className="w-full max-w-md mb-4 border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-ink"
        />
        {filtered.length === 0 ? (
          <div className="card-flat p-10 text-center">
            <div className="font-display text-xl font-bold">No leads yet</div>
            <p className="text-sm text-neutral-500 mt-2">Import a CSV with columns: first_name, last_name, email, company, title.</p>
          </div>
        ) : (
          <div className="border border-line bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="ui-label text-left p-3">Name</th>
                  <th className="ui-label text-left p-3">Email</th>
                  <th className="ui-label text-left p-3">Company</th>
                  <th className="ui-label text-left p-3">Title</th>
                  <th className="ui-label text-right p-3">ICP</th>
                  <th className="ui-label text-center p-3">Verified</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-b border-line hover:bg-surfacehover">
                    <td className="p-3 font-medium">{l.first_name} {l.last_name}</td>
                    <td className="p-3 font-mono text-xs text-neutral-700">{l.email}</td>
                    <td className="p-3">{l.company}</td>
                    <td className="p-3 text-neutral-600">{l.title}</td>
                    <td className="p-3 text-right font-mono">{l.icp_score}</td>
                    <td className="p-3 text-center">{l.verified ? <span className="text-green-700">✓</span> : "—"}</td>
                    <td className="p-3 text-right space-x-2">
                      <button onClick={() => suppress(l.email)} data-testid={`suppress-${l.id}`} className="text-xs text-neutral-500 hover:text-ink">suppress</button>
                      <button onClick={() => remove(l.id)} data-testid={`delete-${l.id}`} className="text-xs text-red-600 hover:underline">delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <form onSubmit={add} className="bg-white border border-line p-6 rounded-sm w-full max-w-md space-y-3">
            <div className="font-display font-bold text-xl">Add lead</div>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} data-testid="new-lead-fname" className="border border-line px-3 py-2 rounded-sm" />
              <input placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} data-testid="new-lead-lname" className="border border-line px-3 py-2 rounded-sm" />
            </div>
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="new-lead-email" className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="new-lead-company" className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="new-lead-title" className="w-full border border-line px-3 py-2 rounded-sm" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" data-testid="save-new-lead" className="btn-primary">Add lead</button>
            </div>
          </form>
        </div>
      )}

      <ProspectFinder open={finder} onClose={() => setFinder(false)} onDone={load} />
    </div>
  );
}
