import type { ReactNode } from 'react';
import { SkeletonList } from './Skeleton';
import { ErrorState } from './ErrorState';
import { EmptyState, type EmptyStateProps } from './EmptyState';

interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : undefined);

/** Loading → skeleton, failure → calm retry, nothing → empty state, otherwise the content. */
export function QueryView<T>({ query, isEmpty, empty, loading, children }: { query: QueryLike<T>; isEmpty?: (d: T) => boolean; empty?: EmptyStateProps; loading?: ReactNode; children: (data: T) => ReactNode }) {
  if (query.isPending) return <>{loading ?? <SkeletonList />}</>;
  if (query.isError || query.data === undefined) return <ErrorState message={messageOf(query.error)} onRetry={() => void query.refetch()} />;
  if (empty && isEmpty?.(query.data)) return <EmptyState {...empty} />;
  return <>{children(query.data)}</>;
}
