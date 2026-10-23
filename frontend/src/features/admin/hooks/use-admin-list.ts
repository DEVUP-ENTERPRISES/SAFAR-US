'use client';

import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { TablePaging } from '@/features/admin/components/data-table';

type Filters = Record<string, string | number | boolean | undefined>;

/**
 * One page of an admin list from the server. Works with both styles the API
 * uses: skip/limit with a total, and a "next cursor". Changing a filter goes
 * back to page 1; the previous rows stay on screen while the next page loads.
 */
export function useAdminList<T extends { _id: string }>(path: string, filters: Filters = {}, pageSize = 25) {
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    setPage(0);
    setCursors([null]);
  }, [filterKey]);

  const cursor = cursors[page] ?? null;
  const q = useQuery({
    queryKey: ['admin-list', path, filterKey, page, cursor],
    queryFn: async () => {
      const res = await api.raw<T[]>(path, {
        method: 'GET',
        query: { ...filters, limit: pageSize, skip: page * pageSize, ...(cursor ? { cursor } : {}) },
      });
      const total = typeof res.meta?.total === 'number' ? res.meta.total : undefined;
      const next = res.meta?.pagination?.nextCursor ?? null;
      const hasMore = res.meta?.pagination ? !!res.meta.pagination.hasMore : total !== undefined ? (page + 1) * pageSize < total : res.data.length === pageSize;
      return { rows: res.data, total, next, hasMore };
    },
    placeholderData: keepPreviousData,
  });

  const paging: TablePaging = useMemo(() => ({
    page,
    pageSize,
    total: q.data?.total,
    hasMore: !!q.data?.hasMore,
    isFetching: q.isFetching && !q.isLoading,
    onPage: (p: number) => {
      if (p < 0) return;
      if (p > page && q.data?.next) setCursors((c) => { const n = [...c]; n[p] = q.data!.next; return n; });
      setPage(p);
    },
  }), [page, pageSize, q.data, q.isFetching, q.isLoading]);

  return { rows: q.data?.rows, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch, paging, total: q.data?.total };
}
