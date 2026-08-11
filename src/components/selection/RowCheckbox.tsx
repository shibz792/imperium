"use client";

import { useSelection } from "./SelectionContext";

export function RowCheckbox({ id }: { id: string }) {
  const { isSelected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      checked={isSelected(id)}
      onChange={() => toggle(id)}
      className="h-4 w-4 accent-ir-gold-dark"
      aria-label="Select row"
    />
  );
}
