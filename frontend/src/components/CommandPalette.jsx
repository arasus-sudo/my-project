import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "./ui/command";
import { DialogTitle } from "./ui/dialog";
import { Users, Send, Share2, CalendarClock, FileBarChart, Layers, Search } from "lucide-react";

const TYPE_ICON = {
  lead: Users, campaign: Send, post: Share2, booking: CalendarClock,
  proposal: FileBarChart, project: Layers,
};
const TYPE_LABEL = {
  lead: "Leads", campaign: "Campaigns", post: "Social posts", booking: "Bookings",
  proposal: "Proposals", project: "Create EQ projects",
};

export default function CommandPalette() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); }
  }, [open]);

  const search = useCallback((q) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    api.get("/search", { params: { q: q.trim() } })
      .then((r) => setResults(r.data))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  const select = (result) => {
    setOpen(false);
    nav(result.url);
  };

  const grouped = results.reduce((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <DialogTitle className="sr-only">Search the suite</DialogTitle>
      <CommandInput
        placeholder="Search leads, campaigns, posts, bookings, proposals, projects…"
        value={query}
        onValueChange={search}
        data-testid="command-palette-input"
      />
      <CommandList>
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <CommandEmpty>No results for “{query}”.</CommandEmpty>
        )}
        {query.trim().length < 2 && (
          <div className="py-8 text-center text-caption text-ink-muted">
            <Search size={16} className="mx-auto mb-2 opacity-40" />
            Type at least 2 characters to search across the suite.
          </div>
        )}
        {Object.entries(grouped).map(([type, items]) => (
          <CommandGroup key={type} heading={TYPE_LABEL[type] || type}>
            {items.map((r) => {
              const Icon = TYPE_ICON[r.type] || Search;
              return (
                <CommandItem key={`${r.type}-${r.id}`} onSelect={() => select(r)} data-testid={`search-result-${r.type}-${r.id}`}>
                  <Icon size={14} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{r.title}</div>
                    {r.subtitle && <div className="text-caption text-ink-muted truncate">{r.subtitle}</div>}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
