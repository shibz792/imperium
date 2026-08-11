"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type SelectionValue = {
  ids: string[];
  selected: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  allSelected: boolean;
  someSelected: boolean;
};

const SelectionCtx = createContext<SelectionValue | null>(null);

// Shared row-selection state for a bulk-actions toolbar. Page-scoped on
// purpose: `ids` is exactly the rows the server just fetched for the
// current page/filter (the same array passed to paginationParams' `take`),
// never "everything matching the filter" — simpler and safer for
// destructive actions than a cross-page "select all N matching" model.
// Give this a `key` derived from the page/filter query string wherever
// it's mounted, so navigating to a different page or filter remounts it
// and starts selection fresh instead of carrying over now-stale ids.
export function SelectionProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const value = useMemo<SelectionValue>(() => {
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    return {
      ids,
      selected,
      isSelected: (id) => selected.has(id),
      toggle: (id) =>
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      toggleAll: () => setSelected((s) => (ids.length > 0 && ids.every((id) => s.has(id)) ? new Set() : new Set(ids))),
      clear: () => setSelected(new Set()),
      allSelected,
      someSelected: selected.size > 0,
    };
  }, [ids, selected]);

  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

export function useSelection() {
  const ctx = useContext(SelectionCtx);
  if (!ctx) throw new Error("useSelection must be used within a SelectionProvider");
  return ctx;
}
