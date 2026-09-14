export interface PaginationProps {
  readonly totalRows: number;
  readonly rowsPerPage: number;
  /** 1-indexed. */
  readonly currentPage: number;
  readonly onPageChange: (page: number) => void;
}

const NAV_BUTTON_CLASS =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-ink-muted';

const PAGE_BUTTON_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-md border border-line text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand';

const PAGE_BUTTON_ACTIVE_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-md border border-brand bg-brand/10 text-sm font-semibold text-brand';

/**
 * Page numbers to render: every page when there are 7 or fewer, otherwise
 * first, last, and current±1, with 'ellipsis' filling any gap between them
 * — never all 500 buttons for a 500-row table.
 */
function getPageItems(currentPage: number, totalPages: number): readonly (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const keep = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = [...keep].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);

  const items: (number | 'ellipsis')[] = [];
  let previous: number | null = null;
  for (const page of sorted) {
    if (previous !== null && page - previous > 1) {
      items.push('ellipsis');
    }
    items.push(page);
    previous = page;
  }
  return items;
}

/**
 * Shared pagination control for every long report table. Renders nothing
 * when the data already fits on one page — a short table (e.g. Wages'
 * staff list today) never shows an empty-looking pagination bar.
 */
export function Pagination({
  totalRows,
  rowsPerPage,
  currentPage,
  onPageChange,
}: PaginationProps): React.JSX.Element | null {
  if (totalRows <= rowsPerPage) {
    return null;
  }

  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const startRow = (currentPage - 1) * rowsPerPage + 1;
  const endRow = Math.min(currentPage * rowsPerPage, totalRows);
  const pageItems = getPageItems(currentPage, totalPages);

  return (
    <div className="flex flex-col items-center gap-2 pt-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={currentPage === 1}
          onClick={() => {
            onPageChange(currentPage - 1);
          }}
          className={NAV_BUTTON_CLASS}
        >
          Previous
        </button>

        {pageItems.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${String(index)}`} className="px-1 text-sm text-ink-faint">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={`Page ${String(item)}`}
              aria-current={item === currentPage ? 'page' : undefined}
              onClick={() => {
                onPageChange(item);
              }}
              className={item === currentPage ? PAGE_BUTTON_ACTIVE_CLASS : PAGE_BUTTON_CLASS}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          aria-label="Next page"
          disabled={currentPage === totalPages}
          onClick={() => {
            onPageChange(currentPage + 1);
          }}
          className={NAV_BUTTON_CLASS}
        >
          Next
        </button>
      </div>

      <p className="text-xs text-ink-faint">
        Showing {startRow}–{endRow} of {totalRows} rows
      </p>
    </div>
  );
}
