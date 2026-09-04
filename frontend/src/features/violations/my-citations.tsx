'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileWarning, ExternalLink, Scale } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';

interface Violation {
  _id: string;
  bookingId: string;
  citationRef: string;
  issuedBy: string;
  type: string;
  description?: string;
  amount: number;
  currency: string;
  occurredAt: string;
  status: 'reported' | 'charged' | 'disputed' | 'waived' | 'resolved';
  evidenceUrl?: string;
  createdAt: string;
}

const money = (c: number, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(c / 100);

/**
 * Citations charged to me, and the way to argue with one.
 *
 * The endpoints for this existed and nothing called them: a guest could be
 * charged for a parking ticket and had no screen showing it, no evidence to
 * look at, and no way to say it was not theirs. Charging someone with no
 * recourse is not a UI gap, it is a fairness problem, and it is the kind of
 * thing that becomes a chargeback and a review.
 *
 * The evidence link sits next to the amount deliberately. A citation without
 * the notice attached is an assertion; with it, most disputes never start.
 */
export function MyCitations() {
  const qc = useQueryClient();
  const toast = useToast();
  const [disputing, setDisputing] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const q = useQuery({
    queryKey: ['my-violations'],
    queryFn: () => api.get<Violation[]>('/violations/me'),
    retry: false,
  });

  const dispute = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) => api.post(`/violations/${id}/dispute`, { reason: why }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Dispute sent', description: 'The charge is on hold until we review it.' });
      setDisputing(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['my-violations'] });
    },
    onError: () => toast({ tone: 'error', title: 'Could not send that dispute' }),
  });

  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
  if (q.isError) return null;

  const items = q.data ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FileWarning className="h-8 w-8" />}
        title="No citations"
        description="Tickets or tolls from your trips would appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((v) => {
        const open = v.status === 'reported' || v.status === 'charged';
        return (
          <Card key={v._id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="capitalize">{v.type}</span>
                    <Badge
                      tone={
                        v.status === 'waived' || v.status === 'resolved' ? 'success'
                          : v.status === 'disputed' ? 'warning' : 'muted'
                      }
                    >
                      {v.status === 'disputed' ? 'Under review' : v.status}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {v.issuedBy} · ref <span className="font-mono">{v.citationRef}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Occurred {new Date(v.occurredAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  {v.description && <p className="mt-1 text-sm">{v.description}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="numeric text-lg font-bold">{money(v.amount, v.currency)}</span>
                  {/* The notice itself — an assertion becomes evidence. */}
                  {v.evidenceUrl && (
                    <a
                      href={v.evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      See the notice <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {open && disputing !== v._id && (
                <Button size="sm" variant="outline" onClick={() => { setDisputing(v._id); setReason(''); }}>
                  <Scale className="h-3.5 w-3.5" /> This is not mine
                </Button>
              )}

              {disputing === v._id && (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="What is wrong with this charge? The more specific, the faster we can settle it."
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={reason.trim().length < 10}
                      loading={dispute.isPending}
                      onClick={() => dispute.mutate({ id: v._id, why: reason.trim() })}
                    >
                      Send dispute
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDisputing(null)}>Cancel</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The charge is held while we look at it. You are not paying anything in the meantime.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
