'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { partnerManageApi, type TermsVersion } from '@/features/asset-partners/manage-api';

const manage = partnerManageApi('/ioc');
const usd = (c: number) => formatMoney({ amount: c, currency: 'USD' });
const STATUS: Record<TermsVersion['status'], { label: string; tone: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  active: { label: 'Signed', tone: 'success' },
  pending_signature: { label: 'Waiting for partner', tone: 'warning' },
  cancelled: { label: 'Withdrawn', tone: 'muted' },
  declined: { label: 'Declined by partner', tone: 'destructive' },
};

function summary(t: TermsVersion['terms']) {
  return `${t.managementFeeBps / 100}% fee · insurance ${usd(t.insuranceMonthlyCents)} · detailing ${usd(t.detailingMonthlyCents)} · cap ${usd(t.deductibleCapCents)} · repairs over ${usd(t.maintenanceApprovalCents)} · paid on the ${t.payoutDayOfMonth}th`;
}

/** The change waiting for the partner, and every version of their terms with when it applied. */
export function TermsHistory({ partnerId }: { partnerId: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({ queryKey: ['ioc-terms-history', partnerId], queryFn: () => manage.termsHistory(partnerId) });
  const cancel = useMutation({
    mutationFn: () => manage.cancelTermsChange(partnerId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ioc-terms-history', partnerId] });
      toast({ tone: 'success', title: 'Change withdrawn. The current terms continue.' });
    },
    onError: () => toast({ tone: 'error', title: 'Could not withdraw the change' }),
  });

  if (q.isLoading) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (q.isError || !q.data || q.data.history.length === 0) return null;
  const { history, pending } = q.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-primary" aria-hidden /> Terms history</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Each trip is charged at the terms in force on the day it ended, so past statements never change.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending && (
          <div className="flex flex-col gap-3 rounded-sm border border-warning/40 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-warning" aria-hidden />Waiting for the partner to sign</p>
              <p className="text-muted-foreground">{summary(pending.terms)}</p>
              <p className="text-xs text-muted-foreground">Sent {formatDate(pending.createdAt)} · starts {formatDate(pending.requestedFrom)} or when signed{pending.reason ? ` · ${pending.reason}` : ''}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              loading={cancel.isPending}
              onClick={async () => {
                const { ok } = await confirm({ title: 'Withdraw this change?', description: 'The partner can no longer sign it; their current terms continue.', confirmLabel: 'Withdraw', tone: 'destructive' });
                if (ok) cancel.mutate();
              }}
            >
              Withdraw
            </Button>
          </div>
        )}
        <ul className="divide-y divide-border text-sm">
          {history.map((v) => (
            <li key={v._id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{v.kind === 'baseline' ? 'Signed with the agreement' : 'Change'}</p>
                <p className="text-muted-foreground">{summary(v.terms)}</p>
                <p className="text-xs text-muted-foreground">
                  {v.status === 'active' ? `In force from ${formatDate(v.effectiveFrom)}` : `Created ${formatDate(v.createdAt)}`}
                  {v.envelopeId ? ` · ${v.envelopeId}` : ''}
                </p>
              </div>
              <Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
