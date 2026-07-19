'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { formatMoney, formatDateRange } from '@/lib/utils/format';
import { corporateApi } from '@/features/corporate/api';

const TONE: Record<string, 'warning' | 'success' | 'destructive' | 'default'> = {
  pending: 'warning', approved: 'default', rejected: 'destructive', booked: 'success',
};

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('pending');
  const requests = useQuery({ queryKey: ['corp-requests', status], queryFn: () => corporateApi.requests(status || undefined) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['corp-requests'] });
  // The backend accepts a decision note — now we actually send the manager's.
  const decide = useMutation({
    mutationFn: ({ id, d, note }: { id: string; d: 'approved' | 'rejected'; note?: string }) =>
      corporateApi.decide(id, d, note),
    onSuccess: invalidate,
  });
  const book = useMutation({ mutationFn: (id: string) => corporateApi.book(id), onSuccess: invalidate });

  const rule = async (r: any, d: 'approved' | 'rejected') => {
    const approving = d === 'approved';
    const flagged = r.policyFlags.length > 0;
    const { ok, reason } = await confirm({
      title: approving ? `Approve this trip for ${r.employeeEmail}?` : `Reject this trip request?`,
      description: approving ? (
        <>
          Estimated cost <strong>{formatMoney({ amount: r.estimatedTotal, currency: r.currency })}</strong>,
          billed to the company.
          {flagged && (
            <>
              {' '}This request <strong>breaches your travel policy</strong> ({r.policyFlags.join(', ').replace(/_/g, ' ')}).
            </>
          )}
        </>
      ) : (
        <>{r.employeeEmail} will be told the request was rejected, along with your note.</>
      ),
      confirmLabel: approving ? 'Approve trip' : 'Reject request',
      tone: approving && !flagged ? 'default' : 'destructive',
      reason: {
        label: 'Note to the employee',
        placeholder: approving ? 'e.g. Approved — keep receipts' : 'e.g. Over budget for this quarter',
        required: !approving,
      },
    });
    if (ok) decide.mutate({ id: r._id, d, note: reason || undefined });
  };

  const bookTrip = async (r: any) => {
    const { ok } = await confirm({
      title: 'Book this trip now?',
      description: (
        <>
          This creates a real booking and charges the company{' '}
          <strong>{formatMoney({ amount: r.estimatedTotal, currency: r.currency })}</strong>.
        </>
      ),
      confirmLabel: 'Book trip',
    });
    if (ok) book.mutate(r._id);
  };

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Trip approvals</h1>
      <div className="flex gap-2">
        {['pending', 'approved', 'booked', 'rejected', ''].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All'}</Chip>
        ))}
      </div>

      {requests.isLoading && <Skeleton className="h-40 w-full" />}
      {requests.data && requests.data.length === 0 && <EmptyState title="No requests" description="Employee trip requests appear here." />}
      {requests.data && requests.data.length > 0 && (
        <div className="space-y-3">
          {requests.data.map((r) => (
            <Card key={r._id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.employeeEmail}</span>
                    <Badge tone={TONE[r.status]}>{r.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{formatDateRange(r.start, r.end)} · {formatMoney({ amount: r.estimatedTotal, currency: r.currency })}</p>
                  {r.reason && <p className="text-xs text-muted-foreground">“{r.reason}”</p>}
                  {r.policyFlags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.policyFlags.map((f) => <Badge key={f} tone="destructive">{f.replace(/_/g, ' ')}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {r.status === 'pending' && (
                    <>
                      <Button size="sm" loading={decide.isPending} onClick={() => rule(r, 'approved')}>Approve</Button>
                      <Button size="sm" variant="outline" className="text-destructive" loading={decide.isPending} onClick={() => rule(r, 'rejected')}>Reject</Button>
                    </>
                  )}
                  {r.status === 'approved' && (
                    <Button size="sm" loading={book.isPending} onClick={() => bookTrip(r)}>Book trip</Button>
                  )}
                  {r.status === 'booked' && <span className="text-xs text-muted-foreground">Booked ✓</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
