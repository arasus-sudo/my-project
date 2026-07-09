import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/AppLayout";

export default function Settings() {
  const { user, workspace } = useAuth();
  return (
    <div>
      <PageHeader title="Settings" subtitle="Workspace, team and brand voice." />
      <div className="p-6 grid md:grid-cols-2 gap-6">
        <div className="card-flat p-6">
          <div className="ui-label mb-3">Workspace</div>
          <div className="space-y-3 text-sm">
            <Row k="Name" v={workspace?.name} />
            <Row k="Plan" v={workspace?.plan || "trial"} />
            <Row k="Owner" v={user?.email} />
          </div>
        </div>
        <div className="card-flat p-6">
          <div className="ui-label mb-3">You</div>
          <div className="space-y-3 text-sm">
            <Row k="Name" v={user?.name} />
            <Row k="Email" v={user?.email} />
            <Row k="Role" v={user?.role || "org_admin"} />
          </div>
        </div>
        <div className="card-flat p-6 md:col-span-2">
          <div className="ui-label mb-3">Brand voice</div>
          <p className="text-sm text-neutral-600 max-w-2xl">
            Tune the assistant's tone (warm, direct, playful), add banned phrases, and provide sample emails.
            Full brand-voice controls arrive with the LLM integration — hook GPT-5.2 / Claude Sonnet 4.5 / Gemini 3
            into <span className="font-mono text-xs">POST /api/ai/personalize</span> to activate.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between border-b border-line py-2">
      <span className="ui-label">{k}</span>
      <span className="font-mono text-sm">{v || "—"}</span>
    </div>
  );
}
