'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Trash2, Search, MapPin, SlidersHorizontal } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { savedSearchApi, type SavedSearch } from '@/features/saved-search/api';
import { FUEL_LABEL } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

function summarise(c: SavedSearch['criteria']): string {
  const bits: string[] = [];
  if (c.category) bits.push(c.category);
  if (c.fuelType) bits.push(FUEL_LABEL[c.fuelType as keyof typeof FUEL_LABEL] ?? c.fuelType);
  if (c.transmission) bits.push(c.transmission);
  if (c.seatsMin) bits.push(`${c.seatsMin}+ seats`);
  if (c.instantBook) bits.push('Instant Book');
  if (c.priceMaxCents) bits.push(`≤ $${Math.round(c.priceMaxCents / 100)}/day`);
  return bits.join(' · ') || 'Any car';
}

function toSearchHref(c: SavedSearch['criteria']): string {
  const q = new URLSearchParams();
  if (c.city) q.set('city', c.city);
  if (c.category) q.set('category', c.category);
  return `/search?${q.toString()}`;
}

function SavedSearches() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: () => savedSearchApi.list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['saved-searches'] });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      savedSearchApi.setAlerts(id, enabled),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => savedSearchApi.remove(id),
    onSuccess: invalidate,
  });

  const doRemove = async (s: SavedSearch) => {
    const { ok } = await confirm({
      title: `Delete "${s.label}"?`,
      description: "You'll stop getting alerts for this search.",
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (ok) remove.mutate(s._id);
  };

  return (
    <div className="mx-auto max-w-2xl px-0 py-0">

      {/* Header */}
      <div className="mb-8">
        <h1 className="display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Saved searches
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          We'll alert you when a new vehicle matches your saved criteria.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="Couldn't load your saved searches." retry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="No saved searches yet"
          description='Run a search and tap "Save search" to be alerted about new vehicles.'
          action={
            <Link href="/search">
              <Button>Browse vehicles</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.map((s) => (
            <div
              key={s._id}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md sm:p-5"
            >
              {/* Icon */}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <SlidersHorizontal className="h-5 w-5" />
              </span>

              {/* Info */}
              <Link href={toSearchHref(s.criteria)} className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground hover:text-primary">
                  {s.label}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  {s.criteria.city && (
                    <>
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="shrink-0">{s.criteria.city}</span>
                      <span className="text-muted-foreground/40">·</span>
                    </>
                  )}
                  {summarise(s.criteria)}
                </p>
              </Link>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                {/* Bell toggle */}
                <button
                  title={s.alertsEnabled ? 'Alerts on — tap to mute' : 'Alerts off — tap to unmute'}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: s._id, enabled: !s.alertsEnabled })}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                    s.alertsEnabled
                      ? 'bg-primary/10 text-primary hover:bg-primary/20'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {s.alertsEnabled
                    ? <Bell className="h-4 w-4" />
                    : <BellOff className="h-4 w-4" />
                  }
                </button>

                {/* Delete */}
                <button
                  title="Delete this saved search"
                  onClick={() => doRemove(s)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer hint */}
      {data && data.length > 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {data.length} saved search{data.length === 1 ? '' : 'es'} ·{' '}
          <Link href="/search" className="font-medium text-primary hover:underline">
            Start a new search
          </Link>
        </p>
      )}

    </div>
  );
}

export default function SavedSearchesPage() {
  return (
    <AuthGuard>
      <SavedSearches />
    </AuthGuard>
  );
}
