"use client";

// A plain <button type="submit"> that asks first — for a <form action={...}>
// wrapping a destructive server action. window.confirm() isn't fancy, but
// it's a real guard against a stray click permanently deleting something
// with no undo, which is what every delete in this app did before this.
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  className,
  title,
}: {
  confirmMessage: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="submit"
      title={title}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
