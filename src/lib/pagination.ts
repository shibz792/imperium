// Shared page-size + skip/take math for every list page. One place to
// change the page size platform-wide, and one place that can't get the
// off-by-one math wrong per page.
export const PAGE_SIZE = 30;

export function paginationParams(sp: { page?: string }) {
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  return { page, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

export function totalPages(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
