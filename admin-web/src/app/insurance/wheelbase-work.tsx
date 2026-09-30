'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileCheck2, FileWarning, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { adminApi, type WheelbaseClaim, type WheelbaseClaimStatus, type WheelbaseTripRow } from '@/features/admin/api';

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const usd = (cents?: number) => (cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function tripsCsv(rows: WheelbaseTripRow[]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Booking', 'Wheelbase listing', 'Vehicle', 'VIN', 'Plate', 'Driver', 'Driver email', 'Trip start', 'Trip end', 'Picked up', 'Returned', 'Odometer start', 'Odometer end', 'Plan', 'Protection', 'Deductible ($)', 'Report status', 'Wheelbase reference'];
  const lines = rows.map((r) =>
    [r.code, r.wheelbaseListing, r.vehicle, r.vin, r.plate, r.driver, r.driverEmail, r.start, r.end, r.pickedUpAt, r.returnedAt, r.odometerStart, r.odometerEnd, r.plan, r.protection, r.deductibleCents != null ? (r.deductibleCents / 100).toFixed(2) : '', r.report.status, r.report.reference]
      .map(cell)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

/** Trips on Wheelbase-insured cars that must be reported to Wheelbase, and a record of those that were. */
export function TripsToReport() {
  const qc = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<'pending' | 'reported'>('pending');
  const [picked, setPicked] = useState<string[]>([]);
  const [reference, setReference] = useState('');
  const trips = useQuery({ queryKey: ['wheelbase-trips', view], queryFn: () => adminApi.wheelbaseTrips(view) });
  const rows = trips.data ?? [];

  const mark = useMutation({
    mutationFn: () => adminApi.wheelbaseMarkReported(picked, reference.trim() || undefined),
    onSuccess: (r) => {
      toast({ tone: 'success', title: `${r.updated} trip${r.updated === 1 ? '' : 's'} marked reported` });
      setPicked([]);
      setReference('');
      qc.invalidateQueries({ queryKey: ['wheelbase-trips'] });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' }),
  });

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Card className="rounded-2xl shadow-soft">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" /> Trips to report to Wheelbase</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Every trip on an insured car is added here when it starts. Send them to Wheelbase, then mark them reported.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === 'pending' ? 'primary' : 'outline'} size="sm" onClick={() => { setView('pending'); setPicked([]); }}>To report</Button>
          <Button variant={view === 'reported' ? 'primary' : 'outline'} size="sm" onClick={() => { setView('reported'); setPicked([]); }}>Reported</Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => download(`wheelbase-trips-${view}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', tripsCsv(rows))}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {trips.isLoading && <Skeleton className="h-24 w-full rounded-xl" />}
        {!trips.isLoading && !rows.length && (
          <p className="text-sm text-muted-foreground">{view === 'pending' ? 'Nothing to report. Every started trip has been sent to Wheelbase.' : 'No trips reported yet.'}</p>
        )}
        {rows.map((r) => (
          <label key={r.bookingId} className="flex cursor-pointer flex-wrap items-start gap-3 rounded-xl border border-border p-3 text-sm">
            {view === 'pending' && (
              <input type="checkbox" checked={picked.includes(r.bookingId)} onChange={() => toggle(r.bookingId)} className="mt-1 accent-[hsl(var(--primary))]" />
            )}
            <div className="min-w-[12rem] flex-1">
              <p className="font-semibold">{r.vehicle} · {r.code}</p>
              <p className="text-xs text-muted-foreground">
                Listing #{r.wheelbaseListing ?? '—'} · VIN {r.vin ?? '—'} · Plate {r.plate ?? '—'}
              </p>
            </div>
            <div className="min-w-[10rem]">
              <p>{r.driver || 'Driver'}</p>
              <p className="text-xs text-muted-foreground">{day(r.start)} → {day(r.end)}</p>
            </div>
            <div className="min-w-[10rem] text-xs text-muted-foreground">
              <p>{r.protection ?? r.plan ?? 'Plan'} · deductible {usd(r.deductibleCents)}</p>
              <p>Odometer {r.odometerStart ?? '—'} → {r.odometerEnd ?? '—'}</p>
            </div>
            {r.report.status === 'reported' ? (
              <Badge tone="success">Reported {day(r.report.reportedAt)}{r.report.reference ? ` · ${r.report.reference}` : ''}</Badge>
            ) : (
              <Badge tone="warning">Due since {day(r.report.dueSince)}</Badge>
            )}
          </label>
        ))}
        {view === 'pending' && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={() => setPicked(picked.length === rows.length ? [] : rows.map((r) => r.bookingId))}>
              {picked.length === rows.length ? 'Clear' : 'Select all'}
            </Button>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Wheelbase reference (optional)" className="max-w-xs" />
            <Button size="sm" disabled={!picked.length} loading={mark.isPending} onClick={() => mark.mutate()}>
              Mark {picked.length || ''} reported
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CLAIM_LABEL: Record<WheelbaseClaimStatus, string> = { to_file: 'To file', filed: 'Filed', accepted: 'Accepted', denied: 'Denied', paid: 'Paid' };
const CLAIM_TONE: Record<WheelbaseClaimStatus, 'warning' | 'muted' | 'success' | 'destructive'> = { to_file: 'warning', filed: 'muted', accepted: 'success', denied: 'destructive', paid: 'success' };

/** One claim's path through Wheelbase: file it with the claim pack, then record Wheelbase's decision and payout. */
function ClaimRow({ claim }: { claim: WheelbaseClaim }) {
  const qc = useQueryClient();
  const toast = useToast();
  const ins = claim.insurance;
  const [reference, setReference] = useState(ins.reference ?? '');
  const [payout, setPayout] = useState('');

  const move = useMutation({
    mutationFn: (status: WheelbaseClaimStatus) =>
      adminApi.wheelbaseClaimUpdate(claim._id, {
        status,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(status === 'paid' ? { payoutCents: Math.round(Number(payout) * 100) } : {}),
      }),
    onSuccess: (_r, status) => {
      toast({ tone: 'success', title: `Claim marked ${CLAIM_LABEL[status].toLowerCase()}` });
      qc.invalidateQueries({ queryKey: ['wheelbase-claims'] });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not update' }),
  });

  const pack = useMutation({
    mutationFn: () => adminApi.wheelbaseClaimPack(claim._id),
    onSuccess: (p) => download(`wheelbase-claim-${claim._id.slice(0, 8)}.json`, 'application/json', JSON.stringify(p, null, 2)),
    onError: () => toast({ tone: 'error', title: 'Could not build the claim pack' }),
  });

  return (
    <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{claim.description}</p>
          <p className="text-xs text-muted-foreground">
            Opened {day(claim.createdAt)} · claimed {usd(claim.amountClaimed)} · guest deductible {usd(ins.deductibleCents)}
            {ins.reference ? ` · Wheelbase #${ins.reference}` : ''}
            {ins.payoutCents != null ? ` · paid ${usd(ins.payoutCents)}` : ''}
          </p>
        </div>
        <Badge tone={CLAIM_TONE[ins.status]}>{CLAIM_LABEL[ins.status]}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" loading={pack.isPending} onClick={() => pack.mutate()}>
          <Download className="h-4 w-4" /> Claim pack
        </Button>
        {(ins.status === 'to_file' || ins.status === 'denied') && (
          <>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Wheelbase claim number" className="max-w-[14rem]" />
            <Button size="sm" disabled={!reference.trim()} loading={move.isPending} onClick={() => move.mutate('filed')}>
              {ins.status === 'denied' ? 'Appeal (re-file)' : 'Mark filed'}
            </Button>
          </>
        )}
        {ins.status === 'filed' && (
          <>
            <Button size="sm" loading={move.isPending} onClick={() => move.mutate('accepted')}>Wheelbase accepted</Button>
            <Button size="sm" variant="outline" loading={move.isPending} onClick={() => move.mutate('denied')}>Wheelbase denied</Button>
          </>
        )}
        {ins.status === 'accepted' && (
          <>
            <Input type="number" min={0} step="0.01" value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="Amount Wheelbase paid ($)" className="max-w-[14rem]" />
            <Button size="sm" disabled={!(Number(payout) > 0)} loading={move.isPending} onClick={() => move.mutate('paid')}>Mark paid</Button>
          </>
        )}
      </div>
    </div>
  );
}

export function WheelbaseClaims() {
  const [status, setStatus] = useState<WheelbaseClaimStatus | undefined>(undefined);
  const claims = useQuery({ queryKey: ['wheelbase-claims', status], queryFn: () => adminApi.wheelbaseClaims(status) });
  const rows = claims.data ?? [];

  return (
    <Card className="rounded-2xl shadow-soft">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><FileWarning className="h-5 w-5 text-primary" /> Claims with Wheelbase</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            A damage claim on an insured trip lands here. Once it is filed, the guest is charged at most their deductible; the rest comes from Wheelbase.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([undefined, 'to_file', 'filed', 'accepted', 'denied', 'paid'] as const).map((s) => (
            <Button key={s ?? 'all'} size="sm" variant={status === s ? 'primary' : 'outline'} onClick={() => setStatus(s)}>
              {s ? CLAIM_LABEL[s] : 'All'}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {claims.isLoading && <Skeleton className="h-24 w-full rounded-xl" />}
        {!claims.isLoading && !rows.length && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><FileCheck2 className="h-4 w-4" /> No claims here.</p>
        )}
        {rows.map((c) => <ClaimRow key={c._id} claim={c} />)}
      </CardContent>
    </Card>
  );
}
