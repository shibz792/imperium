"use client";

import { useEffect, useRef } from "react";
import { useSelection } from "./SelectionContext";

export function SelectAllCheckbox() {
  const { ids, allSelected, someSelected, toggleAll } = useSelection();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  if (ids.length === 0) return null;
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={toggleAll}
      className="h-4 w-4 accent-ir-gold-dark"
      aria-label="Select all on this page"
    />
  );
}
