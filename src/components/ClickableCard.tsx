"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, MouseEvent } from "react";

// Same pattern as ClickableRow, for card-shaped containers (a <div>, not a
// <table> row). Needed anywhere a card holds its own interactive element
// (e.g. a WhatsApp button) — wrapping the whole card in a real <Link> would
// nest an <a> inside an <a>, which is invalid HTML and breaks hydration.
export function ClickableCard({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea, label")) return;
    router.push(href);
  }

  return (
    <div onClick={handleClick} className={`cursor-pointer ${className}`}>
      {children}
    </div>
  );
}
