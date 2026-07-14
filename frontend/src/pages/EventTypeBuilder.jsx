import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Save, Plus, Trash2 } from "lucide-react";

const emptyEventType = () => ({
  name: "30 Min Intro Call", duration_minutes: 30, description: "",
  location_type: "video", buffer_before_minutes: 0, buffer_after_minutes: 10,
  daily_limit: 0, min_notice_hours: 2, date_range_days: 21,
  qualifying_questions: [], low_score_threshold: 0, low_score_redirect_url: "",
});

export default function EventTypeBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [et, setEt] = useState(emptyEventType());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || id === "new") return;
    api.get("/schedule-eq/event-types").then((r) => {
      const found = r.data.find((x) => x.id === id);
      if (found) setEt(found);
    });
  }, [id]);

  const addQuestion = () => setEt({ ...et, qualifying_questions: [...et.qualifying_questions, { key: "", prompt: "", type: "string" }] });
  const updateQuestion = (i, patch) => {
    const next = [...et.qualifying_questions];
    next[i] = { ...next[i], ...patch };
    setEt({ ...et, qualifying_questions: next });
  };
  const removeQuestion = (i) => setEt({ ...et, qualifying_questions: et.qualifying_questions.filter((_, x) => x !== i) });

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...et, low_score_redirect_url: et.low_score_redirect_url || null };
      if (id && id !== "new") {
        await api.put(`/schedule-eq/event-types/${id}`, payload);
        toast.success("Saved");
      } else {
        const { data } = await api.post("/schedule-eq/event-types", payload);
        toast.success("Event type created");
        nav(`/app/schedule-eq/event-types/${data.id}`, { replace: true });
      }
    } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title={id && id !== "new" ? et.name : "New event type"}
        subtitle="Duration, location, buffers, and optional AI qualifying questions."
        right={<button onClick={save} disabled={busy} data-testid="save-event-type-btn" className="btn-primary"><Save size={14} /> Save</button>}
      />
      <div className="p-6 max-w-2xl space-y-6">
        <div className="card-flat p-5 space-y-4">
          <div>
            <label className="ui-label block mb-1">Name</label>
            <input value={et.name} onChange={(e) => setEt({ ...et, name: e.target.value })}
              data-testid="et-name" className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <div>
            <label className="ui-label block mb-1">Description</label>
            <textarea value={et.description} onChange={(e) => setEt({ ...et, description: e.target.value })}
              data-testid="et-description" rows={2} className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="ui-label block mb-1">Duration (min)</label>
              <input type="number" value={et.duration_minutes} onChange={(e) => setEt({ ...et, duration_minutes: Number(e.target.value) || 15 })}
                data-testid="et-duration" className="w-full border border-line px-3 py-2 rounded-sm" />
            </div>
            <div>
              <label className="ui-label block mb-1">Location</label>
              <select value={et.location_type} onChange={(e) => setEt({ ...et, location_type: e.target.value })}
                data-testid="et-location" className="w-full border border-line px-3 py-2 rounded-sm">
                <option value="video">Video (Google Meet)</option>
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
              </select>
            </div>
            <div>
              <label className="ui-label block mb-1">Min notice (hrs)</label>
              <input type="number" value={et.min_notice_hours} onChange={(e) => setEt({ ...et, min_notice_hours: Number(e.target.value) || 0 })}
                data-testid="et-min-notice" className="w-full border border-line px-3 py-2 rounded-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="ui-label block mb-1">Buffer before (min)</label>
              <input type="number" value={et.buffer_before_minutes} onChange={(e) => setEt({ ...et, buffer_before_minutes: Number(e.target.value) || 0 })}
                data-testid="et-buffer-before" className="w-full border border-line px-3 py-2 rounded-sm" />
            </div>
            <div>
              <label className="ui-label block mb-1">Buffer after (min)</label>
              <input type="number" value={et.buffer_after_minutes} onChange={(e) => setEt({ ...et, buffer_after_minutes: Number(e.target.value) || 0 })}
                data-testid="et-buffer-after" className="w-full border border-line px-3 py-2 rounded-sm" />
            </div>
            <div>
              <label className="ui-label block mb-1">Daily limit (0=∞)</label>
              <input type="number" value={et.daily_limit} onChange={(e) => setEt({ ...et, daily_limit: Number(e.target.value) || 0 })}
                data-testid="et-daily-limit" className="w-full border border-line px-3 py-2 rounded-sm" />
            </div>
          </div>
        </div>

        <div className="card-flat p-5 space-y-3">
          <div>
            <div className="font-display font-semibold">AI qualifying questions</div>
            <p className="text-xs text-neutral-500">Asked before the calendar is shown; answers are scored 0-100 and can route low-fit guests elsewhere.</p>
          </div>
          <div className="space-y-2">
            {et.qualifying_questions.map((q, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input placeholder="key" value={q.key} onChange={(e) => updateQuestion(i, { key: e.target.value })}
                  data-testid={`et-qfield-key-${i}`} className="w-28 border border-line px-2 py-1.5 rounded-sm text-sm font-mono" />
                <input placeholder="Question to ask" value={q.prompt} onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
                  data-testid={`et-qfield-prompt-${i}`} className="flex-1 border border-line px-2 py-1.5 rounded-sm text-sm" />
                <button onClick={() => removeQuestion(i)} data-testid={`et-qfield-remove-${i}`} className="text-neutral-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={addQuestion} data-testid="et-qfield-add" className="btn-ghost text-xs"><Plus size={12} /> Add question</button>

          {et.qualifying_questions.length > 0 && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-line">
              <div>
                <label className="ui-label block mb-1">Low-score threshold (0=off)</label>
                <input type="number" min={0} max={100} value={et.low_score_threshold}
                  onChange={(e) => setEt({ ...et, low_score_threshold: Number(e.target.value) || 0 })}
                  data-testid="et-low-score-threshold" className="w-full border border-line px-3 py-2 rounded-sm" />
              </div>
              <div>
                <label className="ui-label block mb-1">Redirect URL for low scores</label>
                <input value={et.low_score_redirect_url || ""} onChange={(e) => setEt({ ...et, low_score_redirect_url: e.target.value })}
                  data-testid="et-low-score-redirect" placeholder="https://…" className="w-full border border-line px-3 py-2 rounded-sm" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
