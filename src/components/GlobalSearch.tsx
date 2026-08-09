"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, Building2, ClipboardList, Users, Kanban } from "lucide-react";
import { globalSearch, type SearchResults, type SearchResult } from "@/lib/globalSearch";

const EMPTY: SearchResults = { properties: [], requirements: [], contacts: [], deals: [] };

// One box for the four record types instead of needing to already know
// which section a property/contact/requirement/deal lives in before you
// can look for it. ⌘K / Ctrl+K opens it from anywhere.
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  function openSearch() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 10);
  }

  function close() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setLoading(false);
  }

  function onChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await globalSearch(value);
      setResults(r);
      setLoading(false);
    }, 250);
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) setTimeout(() => inputRef.current?.focus(), 10);
          return true;
        });
      } else if (e.key === "Escape") {
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const total = results.properties.length + results.requirements.length + results.contacts.length + results.deals.length;

  if (!open) {
    return (
      <button
        onClick={openSearch}
        title="Search (⌘K)"
        aria-label="Search"
        className="flex h-8 items-center gap-1.5 rounded-full px-2 text-white/70 hover:bg-white/10 hover:text-white"
      >
        <Search size={16} className="shrink-0" />
        <kbd className="hidden rounded border border-white/15 px-1.5 py-0.5 font-sans text-[0.65rem] text-white/40 md:inline">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[12vh]" onClick={close}>
      <div className="w-full max-w-lg rounded-[3px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-black/8 px-4 py-3">
          <Search size={16} className="shrink-0 text-black/30" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search properties, requirements, contacts, deals…"
            className="flex-1 border-0 bg-transparent text-sm text-ir-navy outline-none placeholder:text-black/30"
          />
          {loading && <Loader2 size={14} className="shrink-0 animate-spin text-black/30" />}
          <button onClick={close} aria-label="Close search" className="shrink-0 text-black/30 hover:text-ir-navy">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <p className="p-6 text-center text-xs text-black/35">Type at least 2 characters…</p>
          ) : !loading && total === 0 ? (
            <p className="p-6 text-center text-xs text-black/40">No matches for &ldquo;{query}&rdquo;.</p>
          ) : (
            <>
              <ResultGroup icon={Building2} label="Properties" items={results.properties} onGo={go} />
              <ResultGroup icon={ClipboardList} label="Requirements" items={results.requirements} onGo={go} />
              <ResultGroup icon={Users} label="Contacts" items={results.contacts} onGo={go} />
              <ResultGroup icon={Kanban} label="Deals" items={results.deals} onGo={go} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultGroup({ icon: Icon, label, items, onGo }: { icon: typeof Building2; label: string; items: SearchResult[]; onGo: (href: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1.5">
      <div className="mb-1 flex items-center gap-1.5 px-2 text-[0.65rem] font-semibold uppercase tracking-wide text-black/35">
        <Icon size={11} /> {label}
      </div>
      {items.map((r) => (
        <button key={r.id} onClick={() => onGo(r.href)} className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-black/[0.03]">
          <span className="text-sm text-ir-navy">{r.title}</span>
          <span className="text-[0.7rem] text-black/40">{r.subtitle}</span>
        </button>
      ))}
    </div>
  );
}
