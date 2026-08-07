"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Shared open/close state between the hamburger trigger (in Topbar) and
// the sidebar drawer it controls — they're siblings in the layout, not
// parent/child, so this is the smallest wiring that connects them without
// prop-drilling through the server-component layout.
const MobileNavCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <MobileNavCtx.Provider value={{ open, setOpen }}>{children}</MobileNavCtx.Provider>;
}

export function useMobileNav() {
  const ctx = useContext(MobileNavCtx);
  if (!ctx) throw new Error("useMobileNav must be used within MobileNavProvider");
  return ctx;
}
