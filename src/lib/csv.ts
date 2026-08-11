// Client-side CSV export for bulk-selected rows — no server route needed,
// since every page already fetches the full row data server-side and (per
// the pre-redacted export-row convention used on each list page) only ever
// hands the client exactly the fields that page is allowed to show.

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
}

// UTF-8 BOM prefix so Excel opens the file with correct encoding rather
// than mangling Sinhala/Tamil names — a bare UTF-8 CSV with no BOM is a
// classic Excel mis-render on Windows.
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const blob = new Blob(["\uFEFF" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
