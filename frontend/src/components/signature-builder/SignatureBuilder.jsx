import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft, Undo2, Redo2, Check, Loader2, Star, MoreHorizontal, Download,
  FileImage, Copy, ClipboardCopy, History, BarChart3, Send, ThumbsUp, ThumbsDown, Link2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import Sidebar from "./Sidebar";
import Canvas from "./Canvas";
import LivePreview from "./LivePreview";
import { newBlock } from "./blockRegistry";
import { renderSignature } from "./renderHtml";
import { blankTemplate } from "./templates";
import { exportPng, exportPdf, copyHtml, copyRich } from "./exportUtils";
import HistoryPanel from "./panels/HistoryPanel";
import AnalyticsPanel from "./panels/AnalyticsPanel";

const AUTOSAVE_DELAY = 1200;

export default function SignatureBuilder({ signature, onBack, onSaved }) {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === "org_admin" || user?.is_admin;
  const initial = signature?.blocks_json?.length
    ? { blocks: signature.blocks_json, style: signature.style_json || blankTemplate().style }
    : blankTemplate();

  const [name, setName] = useState(signature?.name || "");
  const [isDefault, setIsDefault] = useState(signature?.is_default || false);
  const [state, setState] = useState(initial);
  const [signatureId, setSignatureId] = useState(signature?.id || null);
  const [status, setStatus] = useState(signature?.status || "approved");
  const [clickTracking, setClickTracking] = useState(signature?.click_tracking || false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const previewRef = useRef(null);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const skipNextAutosave = useRef(!signature); // don't autosave an untouched blank new signature

  const applyState = (next) => {
    pastRef.current = [...pastRef.current, state].slice(-50);
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
    setState(next);
    setDirty(true);
  };

  const undo = () => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [state, ...futureRef.current];
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
    setState(prev);
    setDirty(true);
  };

  const redo = () => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, state];
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
    setState(next);
    setDirty(true);
  };

  const onBlocksChange = (blocks) => applyState({ ...state, blocks });
  const onStyleChange = (style) => applyState({ ...state, style });
  const onAddBlock = (type) => applyState({ ...state, blocks: [...state.blocks, newBlock(type)] });
  const onLoadTemplate = (t) => applyState({ blocks: JSON.parse(JSON.stringify(t.blocks)), style: { ...t.style } });

  const persist = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { html, text } = renderSignature(state.blocks, state.style);
      const payload = {
        name: name.trim(), content_html: html, content_text: text,
        is_default: isDefault, blocks_json: state.blocks, style_json: state.style,
        click_tracking: clickTracking,
      };
      const { data } = signatureId
        ? await api.put(`/signatures/${signatureId}`, payload)
        : await api.post("/signatures", payload);
      setSignatureId(data.id);
      setStatus(data.status || "approved");
      setDirty(false);
      onSaved?.(data);
    } catch {
      toast.error("Autosave failed — check your connection");
    } finally {
      setSaving(false);
    }
  }, [name, isDefault, state, signatureId, clickTracking, onSaved]);

  useEffect(() => {
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return; }
    if (!dirty) return;
    const t = setTimeout(persist, AUTOSAVE_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, name, isDefault, state, clickTracking]);

  const doExport = async (fn, label) => {
    if (!previewRef.current) return;
    try {
      await fn(previewRef.current, `${(name || "signature").replace(/\s+/g, "-").toLowerCase()}.${label}`);
    } catch {
      toast.error(`Couldn't export as ${label.toUpperCase()}`);
    }
  };

  const doCopy = async (rich) => {
    const { html, text } = renderSignature(state.blocks, state.style);
    try {
      if (rich) await copyRich(html, text); else await copyHtml(html);
      toast.success(rich ? "Copied — paste directly into Gmail/Outlook" : "HTML copied to clipboard");
    } catch {
      toast.error("Clipboard access was blocked");
    }
  };

  const submitForApproval = async () => {
    if (!signatureId) { toast.info("Save the signature first"); return; }
    await api.post(`/signatures/${signatureId}/submit-for-approval`);
    setStatus("pending_approval");
    toast.success("Submitted for approval");
  };
  const approve = async () => {
    await api.post(`/signatures/${signatureId}/approve`);
    setStatus("approved");
    toast.success("Approved");
  };
  const reject = async () => {
    await api.post(`/signatures/${signatureId}/reject`);
    setStatus("draft");
    toast.info("Sent back to draft");
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-line bg-white shrink-0 flex-wrap">
        <button onClick={onBack} className="btn-ghost text-caption" data-testid="sig-back">
          <ArrowLeft size={14} /> Back
        </button>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          placeholder="Signature name"
          className="text-body font-medium border-0 focus:outline-none focus:ring-0 bg-transparent w-48"
          data-testid="sig-name-input"
        />
        <div className="flex items-center gap-1 ml-2">
          <button onClick={undo} disabled={!canUndo} className="btn-ghost text-caption p-1.5 disabled:opacity-30" title="Undo"><Undo2 size={14} /></button>
          <button onClick={redo} disabled={!canRedo} className="btn-ghost text-caption p-1.5 disabled:opacity-30" title="Redo"><Redo2 size={14} /></button>
        </div>
        <button
          onClick={() => { setIsDefault((v) => !v); setDirty(true); }}
          className={`ml-1 inline-flex items-center gap-1 text-caption px-2 py-1 rounded-lg ${isDefault ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-ash"}`}
          data-testid="sig-set-default"
        >
          <Star size={12} fill={isDefault ? "currentColor" : "none"} /> Default
        </button>

        {status === "pending_approval" && (
          isOrgAdmin ? (
            <div className="inline-flex items-center gap-1">
              <span className="text-tiny px-2 py-1 rounded-full bg-warning/10 text-warning">Pending approval</span>
              <button onClick={approve} className="btn-ghost text-caption p-1.5" title="Approve"><ThumbsUp size={13} /></button>
              <button onClick={reject} className="btn-ghost text-caption p-1.5" title="Send back to draft"><ThumbsDown size={13} /></button>
            </div>
          ) : (
            <span className="text-tiny px-2 py-1 rounded-full bg-warning/10 text-warning">Pending approval</span>
          )
        )}
        {status === "draft" && (
          <button onClick={submitForApproval} className="btn-secondary text-caption" data-testid="sig-submit-approval">
            <Send size={12} /> Submit for approval
          </button>
        )}

        <div className="flex-1" />
        <span className="text-caption text-ink-muted inline-flex items-center gap-1.5" data-testid="sig-save-status">
          {saving ? (
            <><Loader2 size={12} className="animate-spin" /> Saving…</>
          ) : dirty ? (
            "Unsaved changes"
          ) : signatureId ? (
            <><Check size={12} className="text-success" /> Saved</>
          ) : (
            "Add a name to start autosaving"
          )}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="btn-ghost text-caption p-1.5" data-testid="sig-more-menu"><MoreHorizontal size={16} /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white">
            <DropdownMenuItem onClick={() => doExport(exportPng, "png")}><Download size={13} className="mr-2" /> Export as PNG</DropdownMenuItem>
            <DropdownMenuItem onClick={() => doExport(exportPdf, "pdf")}><FileImage size={13} className="mr-2" /> Export as PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => doCopy(false)}><Copy size={13} className="mr-2" /> Copy as HTML</DropdownMenuItem>
            <DropdownMenuItem onClick={() => doCopy(true)}><ClipboardCopy size={13} className="mr-2" /> Copy for Gmail/Outlook</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signatureId ? setShowHistory(true) : toast.info("Save first")}><History size={13} className="mr-2" /> Version history</DropdownMenuItem>
            <DropdownMenuItem onClick={() => signatureId ? setShowAnalytics(true) : toast.info("Save first")}><BarChart3 size={13} className="mr-2" /> Click analytics</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={clickTracking} onCheckedChange={(v) => { setClickTracking(v); setDirty(true); }}>
              <Link2 size={13} className="mr-2" /> Click tracking
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 grid grid-cols-[260px_1fr_420px] min-h-0">
        <div className="border-r border-line overflow-y-auto py-2">
          <Sidebar style={state.style} onStyleChange={onStyleChange} onAddBlock={onAddBlock} onLoadTemplate={onLoadTemplate}
            blocks={state.blocks} onBlocksChange={onBlocksChange} />
        </div>
        <div className="overflow-y-auto p-6 bg-bone">
          <Canvas blocks={state.blocks} onChange={onBlocksChange} />
        </div>
        <div className="border-l border-line min-h-0">
          <LivePreview blocks={state.blocks} style={state.style} signatureId={signatureId}
            clickTracking={clickTracking} previewRef={previewRef} />
        </div>
      </div>

      {showHistory && (
        <HistoryPanel signatureId={signatureId} onClose={() => setShowHistory(false)}
          onRestore={(v) => applyState({ blocks: v.blocks_json, style: v.style_json })} />
      )}
      {showAnalytics && (
        <AnalyticsPanel signatureId={signatureId} clickTracking={clickTracking} onClose={() => setShowAnalytics(false)} />
      )}
    </div>
  );
}
