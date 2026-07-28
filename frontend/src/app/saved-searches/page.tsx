'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Trash2, Search } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { savedSearchApi, type SavedSearch } from '@/features/saved-search/api';

function summarise(c: SavedSearch['criteria']): string {
  const bits: string[] = [];
  if (c.category) bits.push(c.category);
  if (c.fuelType) bits.push(c.fuelType);
  if (c.transmission) bits.push(c.transmission);
  if (c.seatsMin) bits.push(`${c.seatsMin}+ seats`);
  if (c.instantBook) bits.push('Instant Book');
  if (c.priceMaxCents) bits.push(`≤ $${Math.round(c.priceMaxCents / 100)}/day`);
  return bits.join(' · ') || 'Any car';
}

/** Rebuild the search URL so "View" reopens the exact search. */
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
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => savedSearchApi.setAlerts(id, enabled),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => savedSearchApi.remove(id), onSuccess: invalidate });

  const doRemove = async (s: SavedSearch) => {
    const { ok } = await confirm({
      title: `Delete “${s.label}”?`,
      description: 'You’ll stop getting alerts for this search.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (ok) remove.mutate(s._id);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="display text-display-sm">Saved searches</h1>
        <p className="mt-1 text-muted-foreground">We’ll alert you when a new car matches.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : isError ? (
        <ErrorState message="Couldn’t load your saved searches." retry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="No saved searches yet"
          description="Run a search and tap “Save search & alert me” to be told about new cars."
          action={<Link href="/search"><Button>Browse cars</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {data.map((s) => (
            <Card key={s._id}>
              <CardContent className="flex items-center justify-between gap-3 pt-6">
                <Link href={toSearchHref(s.criteria)} className="min-w-0 flex-1">
                  <p className="truncate font-semibold hover:text-primary hover:underline">{s.label}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {s.criteria.city ? `${s.criteria.city} — ` : ''}{summarise(s.criteria)}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    title={s.alertsEnabled ? 'Alerts on — mute' : 'Alerts off — unmute'}
                    loading={toggle.isPending}
                    onClick={() => toggle.mutate({ id: s._id, enabled: !s.alertsEnabled })}
                  >
                    {s.alertsEnabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => doRemove(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
