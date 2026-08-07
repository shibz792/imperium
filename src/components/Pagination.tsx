import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "@/lib/pagination";

// Plain server-rendered prev/next — every list page passes its current
// filters through so paging never drops a search/filter the agent had set.
export function Pagination({
  page,
  totalPages,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...searchParams, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${basePath}?${qs.toString()}`;
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mt-4 flex items-center justify-between border-t border-black/8 pt-4">
      <span className="text-xs text-black/45">
        {from}-{to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page <= 1}
          className={`ir-btn ir-btn-ghost !py-1.5 !text-xs ${page <= 1 ? "pointer-events-none opacity-30" : ""}`}
        >
          <ChevronLeft size={13} /> Prev
        </Link>
        <span className="px-2 text-xs text-black/45">
          Page {page} of {totalPages}
        </span>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page >= totalPages}
          className={`ir-btn ir-btn-ghost !py-1.5 !text-xs ${page >= totalPages ? "pointer-events-none opacity-30" : ""}`}
        >
          Next <ChevronRight size={13} />
        </Link>
      </div>
    </div>
  );
}
