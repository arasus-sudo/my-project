import { useState } from "react";
import { PenLine, FileText, Gauge, Loader2 } from "lucide-react";
import { api, isCreditError } from "../../../lib/api";
import { toast } from "sonner";
import { newBlock } from "../blockRegistry";

export default function AiAssistant({ blocks, onBlocksChange, style }) {
  const [busy, setBusy] = useState("");
  const taglineBlock = blocks.find((b) => b.type === "tagline");
  const legalBlock = blocks.find((b) => b.type === "legal");
  const identityBlock = blocks.find((b) => b.type === "identity");
  const [suggestion, setSuggestion] = useState("");

  const call = async (action, text, context) => {
    setBusy(action);
    setSuggestion("");
    try {
      const { data } = await api.post("/signatures/ai-assist", { action, text: text || "", context: context || {} });
      return data.result;
    } catch (err) {
      if (isCreditError(err)) toast.error("Out of credits for assisted actions this cycle");
      else toast.error("Assist failed — try again");
      return null;
    } finally {
      setBusy("");
    }
  };

  const updateTagline = (text) => {
    if (taglineBlock) {
      onBlocksChange(blocks.map((b) => (b.id === taglineBlock.id ? { ...b, data: { text } } : b)));
    } else {
      onBlocksChange([...blocks, { ...newBlock("tagline"), data: { text } }]);
    }
  };

  const improveTagline = async () => {
    const result = await call("improve_tagline", taglineBlock?.data?.text || "");
    if (result) updateTagline(result);
  };

  const rewriteTone = async (tone) => {
    if (!taglineBlock?.data?.text) { toast.info("Add tagline text first"); return; }
    const result = await call(tone === "executive" ? "tone_executive" : "tone_professional", taglineBlock.data.text);
    if (result) updateTagline(result);
  };

  const generateDisclaimer = async () => {
    const company = identityBlock?.data?.company || "";
    const result = await call("generate_disclaimer", "", { company });
    if (!result) return;
    const html = `<p>${result}</p>`;
    if (legalBlock) {
      onBlocksChange(blocks.map((b) => (b.id === legalBlock.id ? { ...b, data: { html } } : b)));
    } else {
      onBlocksChange([...blocks, { ...newBlock("legal"), data: { html } }]);
    }
  };

  const checkAccessibility = async (style) => {
    const result = await call("accessibility", "", {
      textColor: style.primaryColor, fontSize: style.fontSizeBase,
    });
    if (result) setSuggestion(result);
  };

  return (
    <div className="space-y-2">
      <button onClick={improveTagline} disabled={!!busy} className="w-full flex items-center gap-2 border border-line rounded-xl px-3 py-2 text-caption hover:border-ink/40 hover:bg-ash transition-colors disabled:opacity-50">
        {busy === "improve_tagline" ? <Loader2 size={13} className="animate-spin" /> : <PenLine size={13} className="text-ink-muted" />}
        Improve tagline
      </button>
      <button onClick={() => rewriteTone("professional")} disabled={!!busy} className="w-full flex items-center gap-2 border border-line rounded-xl px-3 py-2 text-caption hover:border-ink/40 hover:bg-ash transition-colors disabled:opacity-50">
        {busy === "tone_professional" ? <Loader2 size={13} className="animate-spin" /> : <PenLine size={13} className="text-ink-muted" />}
        Rewrite: Professional tone
      </button>
      <button onClick={() => rewriteTone("executive")} disabled={!!busy} className="w-full flex items-center gap-2 border border-line rounded-xl px-3 py-2 text-caption hover:border-ink/40 hover:bg-ash transition-colors disabled:opacity-50">
        {busy === "tone_executive" ? <Loader2 size={13} className="animate-spin" /> : <PenLine size={13} className="text-ink-muted" />}
        Rewrite: Executive tone
      </button>
      <button onClick={generateDisclaimer} disabled={!!busy} className="w-full flex items-center gap-2 border border-line rounded-xl px-3 py-2 text-caption hover:border-ink/40 hover:bg-ash transition-colors disabled:opacity-50">
        {busy === "generate_disclaimer" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} className="text-ink-muted" />}
        Generate disclaimer
      </button>
      <button onClick={() => checkAccessibility(style)} disabled={!!busy} className="w-full flex items-center gap-2 border border-line rounded-xl px-3 py-2 text-caption hover:border-ink/40 hover:bg-ash transition-colors disabled:opacity-50">
        {busy === "accessibility" ? <Loader2 size={13} className="animate-spin" /> : <Gauge size={13} className="text-ink-muted" />}
        Accessibility suggestions
      </button>
      {suggestion && (
        <p className="text-caption text-ink-muted bg-ash border border-line rounded-xl px-3 py-2">{suggestion}</p>
      )}
      <p className="text-tiny text-ink-muted px-1">Each assisted action uses 1 credit.</p>
    </div>
  );
}
