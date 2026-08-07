"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, MouseEvent } from "react";

// Makes an entire <tr> (or any row-like element) navigate on click, not
// just the title link inside it — "always allow any listing, lead or
// anything to be clickable." Clicks on a real interactive element inside
// the row (a link, button, input, select) are left alone so those still
// work normally instead of double-navigating.
export function ClickableRow({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea, label")) return;
    router.push(href);
  }

  return (
    <tr onClick={handleClick} className={`cursor-pointer ${className}`}>
      {children}
    </tr>
  );
}
