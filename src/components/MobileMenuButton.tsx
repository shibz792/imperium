"use client";

import { Menu } from "lucide-react";
import { useMobileNav } from "./MobileNavContext";

export function MobileMenuButton() {
  const { setOpen } = useMobileNav();
  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      className="mr-1 flex h-8 w-8 items-center justify-center rounded text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
    >
      <Menu size={19} />
    </button>
  );
}
