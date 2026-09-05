'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileWarning, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/rows';
import { useToast } from '@/components/ui/toast';
import { adminApi, type Violation } from '@/features/admin/api';

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

const TABS = [
  { key: 'reported', label: 'Reported' },
  { key: 'charged', label: 'Charged' },
  { key: 'waived', label: 'Waived' },
  { key: '', label: 'All' },
];

/**
 * Citations — tickets and tolls incurred during a trip, passed through at cost.
 *
 * The nav has listed this since the module shipped but the page did not exist.
 * Charging a guest is a money movement, so it is deliberately two clicks and
 * shows the evidence link next to the amount: staff should look at the citation
 * before charging for it, not after a chargeback.
 */
export default function ViolationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState('reported');
  const [waiving, setWaiving] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const list = useQuery({
    queryKey: ['admin-violations', tab],
    queryFn: () => adminApi.violations({ status: tab || undefined, limit: 100 }),
  });

  const done = (msg: string) => {
    toast({ tone: 'success', title: msg });
    setWaiving(null);
    setReason('');
    qc.invalidateQueries({ queryKey: ['admin-violations'] });
  };

  const charge = useMutation({
    mutationFn: (id: string) => adminApi.chargeViolation(id),
    onSuccess: () => done('Charged to the guest'),
    onError: () => toast({ tone: 'error', title: 'Could not charge this citation' }),
  });

  const waive = useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: string }) => adminApi.waiveViolation(id, resolution),
    onSuccess: () => done('Citation waived'),
    onError: () => toast({ tone: 'error', title: 'Could not waive this citation' }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Citations" description="Tickets and tolls from trips, charged through at cost or waived." />

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {list.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : list.isError ? (
        <ErrorState message="Couldn't load citations." retry={() => list.refetch()} />
      ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<FileWarning className="h-8 w-8" />}
          title={tab === 'reported' ? 'Nothing waiting on you' : 'Nothing here'}
          description={tab === 'reported' ? 'Citations reported by hosts appear here for review.' : undefined}
        />
      ) : (
        <div className="space-y-3">
          {list.data!.map((v) => (
            <Row
              key={v._id}
              v={v}
              busy={charge.isPending || waive.isPending}
              waiving={waiving === v._id}
              reason={reason}
              setReason={setReason}
              onStartWaive={() => { setWaiving(v._id); setReason(''); }}
              onCancelWaive={() => setWaiving(null)}
              onCharge={() => charge.mutate(v._id)}
              onWaive={() => waive.mutate({ id: v._id, resolution: reason })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  v, busy, waiving, reason, setReason, onStartWaive, onCancelWaive, onCharge, onWaive,
}: {
  v: Violation; busy: boolean; waiving: boolean; reason: string;
  setReason: (s: string) => void; onStartWaive: () => void; onCancelWaive: () => void;
  onCharge: () => void; onWaive: () => void;
}) {
  const open = v.status === 'reported';
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <span className="font-mono text-sm">{v.citationRef}</span>
              <Badge tone={v.status === 'charged' ? 'success' : v.status === 'waived' ? 'muted' : 'warning'}>
                {v.status}
              </Badge>
              {v.kind && <span className="text-sm font-normal capitalize text-muted-foreground">{v.kind}</span>}
            </p>
            {v.description && <p className="mt-0.5 text-sm text-muted-foreground">{v.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              Occurred {new Date(v.occurredAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              {' · '}booking <span className="font-mono">{v.bookingId.slice(0, 8)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="numeric text-lg font-bold">{money(v.amountCents)}</span>
            {/* Look at the citation before charging for it. */}
            {v.evidenceUrl && (
              <a
                href={v.evidenceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Evidence <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        {open && !waiving && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy} onClick={onCharge}>Charge the guest</Button>
            <Button size="sm" variant="outline" onClick={onStartWaive}>Waive</Button>
          </div>
        )}

        {open && waiving && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              size="sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being waived?"
              className="max-w-sm"
            />
            <Button size="sm" disabled={reason.trim().length < 3} loading={busy} onClick={onWaive}>Confirm waive</Button>
            <Button size="sm" variant="ghost" onClick={onCancelWaive}>Cancel</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
