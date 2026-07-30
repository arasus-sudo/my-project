import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Sparkles, Image as ImageIcon } from "lucide-react";
import { api } from "../../../lib/api";

export default function StockPhotoDrawer({ onClose, onAddAsElement, onAddAsBackground, slideContent }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [results, setResults] = useState([]);
  const [providersConfigured, setProvidersConfigured] = useState(null); // null = haven't searched yet
  const [searched, setSearched] = useState(false);

  const runSearch = async (body) => {
    try {
      const { data } = await api.post("/carousel/asset-search", body);
      setResults(data.results || []);
      setProvidersConfigured(data.providers_configured || []);
    } catch {
      toast.error("Search failed — check your connection");
    } finally {
      setSearched(true);
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    await runSearch({ query: query.trim() });
    setBusy(false);
  };

  const suggestFromSlide = async () => {
    setSuggesting(true);
    await runSearch({ slide_content: slideContent });
    setSuggesting(false);
  };

  const noProvidersConfigured = searched && providersConfigured && providersConfigured.length === 0;

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="stock-photo-drawer">
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <ImageIcon size={16} />
          <div className="font-display font-bold">Stock photos</div>
          <button onClick={onClose} className="ml-auto btn-ghost text-caption">Close</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search photos (e.g. team meeting)"
              data-testid="stock-photo-query"
              className="flex-1 border border-line rounded-full px-3 py-1.5 text-body focus:outline-none focus:border-ink" />
            <button onClick={search} disabled={busy || !query.trim()} data-testid="stock-photo-search"
              className="btn-secondary text-caption px-3">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>
          {slideContent && (
            <button onClick={suggestFromSlide} disabled={suggesting} data-testid="stock-photo-suggest"
              className="w-full btn-ghost text-caption justify-center border border-dashed border-line">
              {suggesting ? <><Loader2 size={13} className="animate-spin" /> Reading this slide…</> : <><Sparkles size={13} /> Suggest from this slide</>}
            </button>
          )}

          {noProvidersConfigured && (
            <div className="text-center py-10 text-ink-muted text-body px-4">
              Stock photos need a free Unsplash or Pexels API key — ask your admin to add one to enable this.
            </div>
          )}

          {!noProvidersConfigured && searched && results.length === 0 && (
            <div className="text-center py-10 text-ink-muted text-body">No results — try a different search.</div>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {results.map((r) => (
                <div key={r.id} className="group relative rounded-lg overflow-hidden border border-line bg-neutral-100">
                  <img src={r.thumb_url || r.url} alt="" className="w-full aspect-[4/5] object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => onAddAsElement(r.url)} title="Add as element"
                      className="bg-white text-ink rounded-full px-3 py-1 text-caption font-medium hover:bg-neutral-100">Add element</button>
                    <button onClick={() => onAddAsBackground(r.url)} title="Set as background"
                      className="bg-white text-ink rounded-full px-3 py-1 text-caption font-medium hover:bg-neutral-100">Background</button>
                  </div>
                  <a href={r.credit_url} target="_blank" rel="noopener noreferrer"
                    className="block px-2 py-1 text-tiny text-ink-muted truncate hover:text-ink hover:underline">
                    {r.source} · {r.credit_name}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
