'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';

/**
 * One Asset Partner: where they are in the programme, the terms actually in
 * force, and the month's statement as the partner sees it.
 *
 * Terms are shown resolved, not just the overrides, so ops quotes the same
 * numbers the partner's statement is built from.
 */

const NEXT_STATUS: Record<string, { to: string; label: string; destructive?: boolean }[]> = {
  onboarding: [
    { to: 'active', label: 'Mark active (car is live)' },
    { to: 'exited', label: 'Exit programme', destructive: true },
  ],
  active: [
    { to: 'suspended', label: 'Suspend', destructive: true },
    { to: 'exited', label: 'Exit programme', destructive: true },
  ],
  suspended: [
    { to: 'active', label: 'Reinstate' },
    { to: 'exited', label: 'Exit programme', destructive: true },
  ],
  exited: [],
};

const TONE: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  onboarding: 'warning',
  active: 'success',
  suspended: 'destructive',
  exited: 'muted',
};

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-asset-partner', id],
    queryFn: () => adminApi.assetPartner(id),
  });
  const statement = useQuery({
    queryKey: ['admin-asset-partner-statement', id],
    queryFn: () => adminApi.assetPartnerStatement(id),
  });

  const setStatus = useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      adminApi.setAssetPartnerStatus(id, status, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-asset-partner', id] });
      qc.invalidateQueries({ queryKey: ['admin-asset-partners'] });
      toast({ tone: 'success', title: 'Status updated' });
    },
    onError: () => toast({ tone: 'error', title: 'Could not update status' }),
  });

  const saveTerms = useMutation({
    mutationFn: (terms: Record<string, number | string | undefined>) =>
      adminApi.setAssetPartnerTerms(id, terms),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-asset-partner', id] });
      qc.invalidateQueries({ queryKey: ['admin-asset-partner-statement', id] });
      toast({ tone: 'success', title: 'Terms updated — the next statement uses them' });
    },
    onError: () => toast({ tone: 'error', title: 'Could not save terms' }),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) {
    return <ErrorState message="Couldn’t load that partner." retry={() => refetch()} />;
  }

  const { partner, terms } = data;
  const money = (v: number) => formatMoney({ amount: v, currency: 'USD' });

  const onStatus = async (to: string, destructive?: boolean) => {
    const { ok, reason } = await confirm({
      title: `Move ${partner.displayName} to "${to}"?`,
      description:
        to === 'suspended'
          ? 'A suspended partner takes no new bookings. Money already earned is still owed.'
          : to === 'exited'
            ? 'Exiting is final — a partner cannot be un-exited.'
            : 'The partner will be told their car is live and start appearing in statements as active.',
      confirmLabel: `Move to ${to}`,
      tone: destructive ? 'destructive' : 'default',
      reason:
        to === 'suspended'
          ? { label: 'Reason (recorded)', placeholder: 'e.g. Insurance lapsed', required: true }
          : undefined,
    });
    if (ok) setStatus.mutate({ status: to, reason });
  };

  /** Only send fields the operator actually typed — the rest stay inherited. */
  const submitTerms = () => {
    const out: Record<string, number | string | undefined> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v === '') continue;
      out[k] = k === 'payoutMethod' ? v : Number(v);
    }
    if (Object.keys(out).length === 0) {
      toast({ tone: 'error', title: 'Nothing to save' });
      return;
    }
    saveTerms.mutate(out);
  };

  return (
    <div className="space-y-5">
      <Link
        href={adminPath('partners')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Asset Partners
      </Link>

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[partner.status] ?? 'muted'}>{partner.status}</Badge>
              <span className="text-xs capitalize text-muted-foreground">{partner.partnerType}</span>
              {terms.negotiated && <Badge tone="warning">Negotiated terms</Badge>}
            </div>
            <h1 className="display mt-2 text-2xl">{partner.displayName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {partner.email ?? '—'} · {partner.phone ?? '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Approved {partner.approvedAt ? formatDate(partner.approvedAt) : '—'}
              {partner.activatedAt && ` · Live ${formatDate(partner.activatedAt)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(NEXT_STATUS[partner.status] ?? []).map((a) => (
              <Button
                key={a.to}
                size="sm"
                variant="outline"
                className={a.destructive ? 'text-destructive' : undefined}
                loading={setStatus.isPending}
                onClick={() => onStatus(a.to, a.destructive)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {partner.suspendedReason && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm">
            <span className="font-semibold">Suspended:</span> {partner.suspendedReason}
          </CardContent>
        </Card>
      )}

      {/* Terms in force — resolved, so this is what the statement uses. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Terms in force</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Leave a field blank to inherit the platform default. Only what you type is negotiated.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Management fee %" hint={`Now ${terms.managementFeeBps / 100}%`}>
              <Input
                type="number"
                step="0.5"
                placeholder={String(terms.managementFeeBps / 100)}
                value={draft.managementFeeBps ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    managementFeeBps: e.target.value === '' ? '' : String(Number(e.target.value) * 100),
                  })
                }
              />
            </Field>
            <Field label="Insurance / vehicle / mo ($)" hint={`Now ${money(terms.insuranceMonthlyCents)}`}>
              <Input
                type="number"
                placeholder={String(terms.insuranceMonthlyCents / 100)}
                value={draft.insuranceMonthlyCents ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    insuranceMonthlyCents:
                      e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * 100)),
                  })
                }
              />
            </Field>
            <Field label="Detailing / vehicle / mo ($)" hint={`Now ${money(terms.detailingMonthlyCents)}`}>
              <Input
                type="number"
                placeholder={String(terms.detailingMonthlyCents / 100)}
                value={draft.detailingMonthlyCents ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    detailingMonthlyCents:
                      e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * 100)),
                  })
                }
              />
            </Field>
            <Field label="Deductible cap ($)" hint={`Now ${money(terms.deductibleCapCents)}`}>
              <Input
                type="number"
                placeholder={String(terms.deductibleCapCents / 100)}
                value={draft.deductibleCapCents ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    deductibleCapCents:
                      e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * 100)),
                  })
                }
              />
            </Field>
            <Field
              label="Maintenance approval over ($)"
              hint={`Now ${money(terms.maintenanceApprovalCents)}`}
            >
              <Input
                type="number"
                placeholder={String(terms.maintenanceApprovalCents / 100)}
                value={draft.maintenanceApprovalCents ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    maintenanceApprovalCents:
                      e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * 100)),
                  })
                }
              />
            </Field>
            <Field label="Payout day" hint={`Now the ${terms.payoutDayOfMonth}th`}>
              <Input
                type="number"
                min={1}
                max={28}
                placeholder={String(terms.payoutDayOfMonth)}
                value={draft.payoutDayOfMonth ?? ''}
                onChange={(e) => setDraft({ ...draft, payoutDayOfMonth: e.target.value })}
              />
            </Field>
            <Field label="Payout method" hint={`Now ${terms.payoutMethod}`}>
              <Select
                value={draft.payoutMethod ?? ''}
                onChange={(e) => setDraft({ ...draft, payoutMethod: e.target.value })}
              >
                <option value="">Inherit ({terms.payoutMethod})</option>
                <option value="check">Check</option>
                <option value="zelle">Zelle</option>
              </Select>
            </Field>
          </div>
          <Button loading={saveTerms.isPending} onClick={submitTerms}>
            Save negotiated terms
          </Button>
        </CardContent>
      </Card>

      {/* The statement, exactly as the partner sees it. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Statement {statement.data ? `· ${statement.data.period}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm">
          {statement.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : statement.data ? (
            <>
              <Row label="Gross booking revenue" value={money(statement.data.totals.gross)} />
              <Row
                label={`Management fee (${statement.data.terms.managementFeeBps / 100}%)`}
                value={`−${money(statement.data.totals.managementFee)}`}
              />
              <Row label="Fleet insurance" value={`−${money(statement.data.totals.insurance)}`} />
              <Row label="Detailing" value={`−${money(statement.data.totals.detailing)}`} />
              <div className="border-t border-border pt-2.5">
                <Row label="Partner net" value={money(statement.data.totals.net)} strong />
              </div>
              <p className="pt-2 text-xs text-muted-foreground">
                {statement.data.totals.trips} completed trip
                {statement.data.totals.trips === 1 ? '' : 's'} · pays{' '}
                {formatDate(statement.data.payoutDate)} by {statement.data.payoutMethod} ·{' '}
                {statement.data.final ? 'final' : 'month still running'}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No statement available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-bold' : 'font-medium'}>{value}</span>
    </div>
  );
}
