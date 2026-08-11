// Shared result shape for every bulk server action (bulkDelete*,
// bulkChange*Status, bulkReassign*Agent, etc.) — a single-row action can
// redirect on failure, but a bulk action can't redirect mid-loop and needs
// to report which of several ids succeeded vs. failed (and why), so the
// calling client component can show a real partial-failure summary instead
// of an all-or-nothing result.
export type BulkActionResult = {
  succeeded: string[];
  failed: { id: string; error: string }[];
};
