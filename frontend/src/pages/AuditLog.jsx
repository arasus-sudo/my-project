import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";

export default function AuditLog() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/audit-log").then((r) => setItems(r.data)); }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Audit log" subtitle="Immutable record of key actions in your workspace." />
      <div className="p-6 sm:p-8">
        {items.length === 0 && <div className="text-sm text-neutral-400">No audit entries yet.</div>}
        <div className="bg-white border border-line rounded-2xl overflow-hidden card-floating">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-line">
                {["Time", "Actor", "Action", "Meta"].map((h) => <th key={h} className="ui-label text-left p-3">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-b-0">
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{e.at?.replace("T", " ").slice(0, 19)}</td>
                  <td className="p-3 text-xs">{e.actor_email}</td>
                  <td className="p-3"><span className="pill">{e.action}</span></td>
                  <td className="p-3 font-mono text-xs text-neutral-500 truncate max-w-md">{JSON.stringify(e.meta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
