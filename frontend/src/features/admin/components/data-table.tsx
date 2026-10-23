'use client';

import { memo, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Numbers and money: right-aligned with fixed-width digits. */
  numeric?: boolean;
  /** Makes the column sortable by this value (sorts the rows on screen). */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Left out of the phone card view, e.g. an action already shown elsewhere. */
  hideOnMobile?: boolean;
}

export interface TablePaging {
  page: number;
  pageSize: number;
  /** Known total, when the server reports one. */
  total?: number;
  hasMore: boolean;
  onPage: (page: number) => void;
  /** True while the next page loads behind the current rows. */
  isFetching?: boolean;
}

type Sort = { col: number; dir: 1 | -1 } | null;

function Pager({ paging, shown }: { paging: TablePaging; shown: number }) {
  const from = paging.page * paging.pageSize + (shown ? 1 : 0);
  const to = paging.page * paging.pageSize + shown;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-subtle px-4 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums" aria-live="polite">
        {shown ? `${from.toLocaleString()}–${to.toLocaleString()}` : '0'}
        {paging.total !== undefined ? ` of ${paging.total.toLocaleString()}` : ''}
        {paging.isFetching ? ' · loading…' : ''}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => paging.onPage(paging.page - 1)}
          disabled={paging.page === 0}
          aria-label="Previous page"
          className="grid h-8 w-8 place-items-center rounded-sm border border-border bg-card transition-colors hover:bg-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[4.5rem] text-center tabular-nums">Page {paging.page + 1}</span>
        <button
          type="button"
          onClick={() => paging.onPage(paging.page + 1)}
          disabled={!paging.hasMore}
          aria-label="Next page"
          className="grid h-8 w-8 place-items-center rounded-sm border border-border bg-card transition-colors hover:bg-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * The table behind every admin list. Four states (loading, empty, error, rows),
 * server pages, sortable columns, right-aligned numbers, and cards on phones.
 */
function DataTableInner<T extends { _id: string }>({
  columns,
  rows,
  isLoading,
  isError,
  onRetry,
  errorMessage = 'We couldn’t load this list.',
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  caption,
  paging,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  errorMessage?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Shown under the table when there is no pager, e.g. "12 rules". */
  caption?: string;
  paging?: TablePaging;
}) {
  const [sort, setSort] = useState<Sort>(null);
  const sorted = useMemo(() => {
    if (!rows || !sort) return rows;
    const get = columns[sort.col]?.sortValue;
    if (!get) return rows;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, sort, columns]);

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card" aria-busy="true">
        <div className="border-b border-border bg-subtle px-4 py-3"><Skeleton className="h-3 w-1/3" /></div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (isError) return <ErrorState message={errorMessage} retry={onRetry} />;
  if (!sorted || sorted.length === 0) {
    if (paging && paging.page > 0) {
      return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No more rows.</p>
          <Pager paging={paging} shown={0} />
        </div>
      );
    }
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const toggle = (i: number) =>
    setSort((s) => (s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 }));
  const footer = paging
    ? <Pager paging={paging} shown={sorted.length} />
    : <div className="border-t border-border bg-subtle px-4 py-2 text-xs text-muted-foreground tabular-nums">{caption ?? `${sorted.length} ${sorted.length === 1 ? 'row' : 'rows'}`}</div>;

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-card', paging?.isFetching && 'opacity-80 transition-opacity')}>
      <div className="hidden max-h-[70vh] overflow-auto sm:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-subtle">
              {columns.map((c, i) => (
                <th
                  key={c.header || i}
                  scope="col"
                  aria-sort={sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  className={cn('whitespace-nowrap px-4 py-3 text-start text-xs font-semibold text-muted-foreground', c.numeric && 'text-end', c.className)}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggle(i)} className={cn('inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', c.numeric && 'flex-row-reverse')}>
                      {c.header}
                      {sort?.col === i ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <span className="h-3 w-3" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row._id} className="border-b border-border transition-colors last:border-0 hover:bg-accent/50">
                {columns.map((c, i) => (
                  <td key={c.header || i} className={cn('px-4 py-3 align-middle', c.numeric && 'text-end tabular-nums', c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border sm:hidden">
        {sorted.map((row) => {
          const [first, ...rest] = columns.filter((c) => !c.hideOnMobile);
          return (
            <li key={row._id} className="space-y-2 px-4 py-3 text-sm">
              {first && <div className="min-w-0 font-medium">{first.cell(row)}</div>}
              {rest.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {rest.map((c, i) => (
                    <div key={c.header || i} className={cn('min-w-0', !c.header && 'col-span-2')}>
                      {c.header && <dt className="text-xs text-muted-foreground">{c.header}</dt>}
                      <dd className={cn('min-w-0 break-words', c.numeric && 'tabular-nums')}>{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>

      {footer}
    </div>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
