'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi, type PartnerRepair, type RepairApproval, type RepairType } from '@/features/asset-partners/manage-api';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';

const manage = partnerManageApi('/ioc');
const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });
const TYPES: { value: RepairType; label: string }[] = [
  { value: 'repair', label: 'Repair' },
  { value: 'service', label: 'Service' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'cleaning', label: 'Cleaning' },
];
const APPROVAL: Record<RepairApproval, { label: string; tone: 'warning' | 'success' | 'destructive' | 'muted' }> = {
  pending: { label: 'Waiting for owner', tone: 'warning' },
  approved: { label: 'Owner approved', tone: 'success' },
  declined: { label: 'Owner declined', tone: 'destructive' },
  not_required: { label: 'Under approval line', tone: 'muted' },
};
const FILTERS: { value: RepairApproval | ''; label: string }[] = [
  { value: 'pending', label: 'Waiting for owner' },
  { value: 'declined', label: 'Declined' },
  { value: '', label: 'All' },
];

function ScheduleForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const cars = useQuery({ queryKey: ['ioc-asset-cars', 'live'], queryFn: () => manage.cars() });
  const [vehicleId, setVehicleId] = useState('');
  const [type, setType] = useState<RepairType>('repair');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () => manage.scheduleRepair({ vehicleId, type, scheduledFor: date, costCents: cost ? Math.round(Number(cost) * 100) : undefined, notes: notes.trim() || undefined }),
    onSuccess: (r) => {
      toast(r.approval === 'pending'
        ? { tone: 'success', title: 'Sent to the owner for approval', description: `It’s above their ${usd(r.approvalThresholdCents ?? 0)} line, so they’re asked first.` }
        : { tone: 'success', title: 'Repair scheduled', description: 'It’s under the owner’s approval line, so it can go ahead.' });
      onDone();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t work' }),
  });
  const live = (cars.data ?? []).filter((c) => !c.endedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Schedule work on a partner car</CardTitle>
        <p className="text-sm text-muted-foreground">Above the owner’s approval line (usually $500), they’re asked to approve before the work goes ahead.</p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field label="Car">
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={cars.isLoading}>
            <option value="">{live.length ? 'Pick a car' : 'No partner cars yet'}</option>
            {live.map((c) => <option key={c.vehicleId} value={c.vehicleId}>{c.label} · {c.partnerName}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as RepairType)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Estimated cost ($)" hint="Leave empty if unknown; it then counts as under the line.">
          <Input type="number" min={0} step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="What and why" className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Replace front brake pads and rotors, worn below limit" />
        </Field>
        <div className="sm:col-span-2">
          <Button className="w-full sm:w-auto" disabled={!vehicleId || !date || (cost !== '' && !(Number(cost) >= 0))} loading={save.isPending} onClick={() => save.mutate()}>Schedule</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RepairRow({ r, onComplete, completing }: { r: PartnerRepair; onComplete: () => void; completing: boolean }) {
  const a = APPROVAL[r.approval];
  const canComplete = r.status !== 'completed' && (r.approval === 'approved' || r.approval === 'not_required');
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {TYPES.find((t) => t.value === r.type)?.label ?? r.type} · <Link href={`/ops/listings/${r.vehicleId}`} className="hover:underline">{r.vehicleLabel}</Link>
          <Badge tone={a.tone}>{a.label}</Badge>
          {r.status === 'completed' && <Badge tone="success">Done</Badge>}
        </p>
        <p className="text-xs text-muted-foreground">
          <Link href={`/ops/partners/members/${r.assetPartnerId}`} className="font-medium text-foreground hover:underline">{r.partnerName}</Link> · {formatDate(r.scheduledFor)}{r.cost !== undefined ? ` · ${usd(r.cost)}` : ''}
        </p>
        {r.notes && <p className="mt-1 text-sm">{r.notes}</p>}
        {r.approval === 'declined' && r.declineReason && <p className="mt-1 text-sm text-destructive">Owner’s reason: {r.declineReason}</p>}
      </div>
      {canComplete && <Button size="sm" variant="outline" loading={completing} onClick={onComplete}><CheckCircle2 className="h-4 w-4" /> Mark done</Button>}
    </div>
  );
}

export default function PartnerRepairsPage() {
  const [filter, setFilter] = useState<RepairApproval | ''>('pending');
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['ioc-partner-repairs', filter], queryFn: () => manage.repairs(filter || undefined) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ioc-partner-repairs'] });
    void qc.invalidateQueries({ queryKey: ['ioc-asset-cars'] });
    void qc.invalidateQueries({ queryKey: ['ioc-asset-overview'] });
  };
  const complete = useMutation({
    meta: { silentError: true },
    mutationFn: (id: string) => api.post(`/maintenance/${id}/complete`, {}),
    onSuccess: refresh,
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t work' }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Asset management"
        title="Repairs"
        description="Work on partner cars and the owner’s yes or no. Owners approve or decline from their portal, and get a message when work needs their OK."
        actions={<Button size="sm" variant={adding ? 'outline' : 'primary'} onClick={() => setAdding(!adding)}>{adding ? 'Close' : <><Plus className="h-4 w-4" /> Schedule work</>}</Button>}
      />
      <PartnersNav />

      {adding && <ScheduleForm onDone={() => { setAdding(false); setFilter(''); refresh(); }} />}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => <Chip key={f.label} active={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</Chip>)}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-60 w-full rounded-lg" />
      ) : q.isError ? (
        <ErrorState message="We couldn’t load repairs." retry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title={filter === 'pending' ? 'Nothing waiting for an owner' : 'No repairs here'} description="Work you schedule on partner cars appears here." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {q.data.map((r) => (
              <RepairRow key={r._id} r={r} completing={complete.isPending && complete.variables === r._id} onComplete={() => complete.mutate(r._id)} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
