'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/**
 * The table behind every admin/corporate list view. Sticky header, zebra rows,
 * and a row count — so long queues stay readable while you scroll them.
 */
export function DataTable<T extends { _id: string }>({
  columns,
  rows,
  isLoading,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  caption,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Shown under the table, e.g. "12 users". Defaults to the row count. */
  caption?: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-soft">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-subtle text-left">
              {columns.map((c) => (
                <th
                  key={c.header}
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row._id}
                className="border-b border-border transition-colors last:border-0 hover:bg-accent/50"
              >
                {columns.map((c) => (
                  <td key={c.header} className={cn('px-4 py-3.5 align-middle', c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border bg-subtle px-4 py-2.5 text-xs text-muted-foreground">
        {caption ?? `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
      </div>
    </div>
  );
}
