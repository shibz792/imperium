"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

// Disables itself and shows a spinner while its parent <form>'s server
// action is in flight — plain <button type="submit"> gives zero feedback
// once clicked, which on a slow connection reads as "did that work?" and
// invites a second click that quietly creates a duplicate record. Must be
// rendered inside the <form> it belongs to (useFormStatus reads the
// nearest form ancestor).
export function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={className}>
      {pending ? (
        <>
          <Loader2 size={14} className="animate-spin" /> {pendingText ?? "Saving…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
