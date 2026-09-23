'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, X, AlertTriangle, FileText, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { adminApi, type ReviewCheck } from '@/features/admin/api';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';

const STATE_STYLES: Record<ReviewCheck['state'], { icon: typeof Check; className: string }> = {
  ok: { icon: Check, className: 'text-emerald-600' },
  attention: { icon: AlertTriangle, className: 'text-amber-600' },
  missing: { icon: X, className: 'text-destructive' },
};

export default function VehicleReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const notify = useToast();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin-vehicle-review', id],
    queryFn: () => adminApi.vehicleReview(id),
  });

  const act = useMutation({
    mutationFn: (action: 'approve' | 'reject') => adminApi.vehicleAction(id, action),
    onSuccess: (_r, action) => {
      notify({ tone: 'success', title: action === 'approve' ? 'Vehicle approved' : 'Vehicle rejected' });
      qc.invalidateQueries({ queryKey: ['admin-vehicles'] });
      qc.invalidateQueries({ queryKey: ['admin-vehicle-review', id] });
      router.push(adminPath('vehicles'));
    },
    onError: () => notify({ tone: 'error', title: 'That did not go through' }),
  });

  const verifyDoc = useMutation({
    mutationFn: (documentId: string) => adminApi.verifyDocument(documentId),
    onSuccess: () => {
      notify({ tone: 'success', title: 'Document verified' });
      qc.invalidateQueries({ queryKey: ['admin-vehicle-review', id] });
    },
    onError: () => notify({ tone: 'error', title: "Couldn't verify that document" }),
  });

  const run = async (action: 'approve' | 'reject') => {
    const missing = data?.checks.filter((c) => c.state === 'missing') ?? [];
    const { ok } = await confirm({
      title: action === 'approve' ? 'Approve this vehicle?' : 'Reject this vehicle?',
      description:
        action === 'approve'
          ? missing.length
            ? `${missing.length} thing${missing.length === 1 ? ' is' : 's are'} still missing (${missing
                .map((m) => m.label)
                .join(', ')}). Approving makes it bookable by real guests anyway.`
            : 'It becomes bookable by guests immediately.'
          : 'It goes back to the host as a draft.',
      confirmLabel: action === 'approve' ? 'Approve' : 'Reject',
      tone: action === 'approve' ? 'default' : 'destructive',
    });
    if (ok) act.mutate(action);
  };

  if (isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (isError) return <ErrorState message="Couldn't load this vehicle." retry={() => refetch()} />;

  const { vehicle: v, documents, host, checks, vinMismatches, readyToApprove } = data;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push(adminPath('vehicles'))}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to queue
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display text-2xl">
            {v.year} {v.make} {v.model}
          </h1>
          <p className="text-sm text-muted-foreground">
            {host ? `${host.displayName}${host.email ? ` · ${host.email}` : ''}` : 'Host not found'}
            {v.location?.city ? ` · ${v.location.city}` : ''} · submitted {formatDate(v.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => run('reject')} loading={act.isPending}>
            Reject
          </Button>
          <Button onClick={() => run('approve')} loading={act.isPending}>
            Approve
          </Button>
        </div>
      </div>

      {v.recallHold && (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          On recall hold — paused after its last trip over an open NHTSA recall. Bookable again once a
          repair receipt is verified below.
        </p>
      )}

      {!readyToApprove && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          Something required is still missing. You can still approve, but the listing goes live as-is.
        </p>
      )}

      <Card>
        <CardContent className="space-y-3 py-5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Review checklist</p>
          {checks.map((c) => {
            const { icon: Icon, className } = STATE_STYLES[c.state];
            return (
              <div key={c.key} className="flex items-start gap-3 text-sm">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} />
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.detail}</span>
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {vinMismatches.length > 0 && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <p className="text-xs font-bold uppercase tracking-widest text-destructive">VIN does not match</p>
            {vinMismatches.map((m) => (
              <p key={m.field} className="text-sm">
                <span className="font-medium">{m.field}:</span> VIN says{' '}
                <span className="font-mono">{m.vinSays}</span>, host entered{' '}
                <span className="font-mono">{m.hostTyped}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Photos ({v.photos?.length ?? 0})
          </p>
          {v.photos?.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {v.photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={i} href={p.url} target="_blank" rel="noreferrer" className="group relative block">
                  <img
                    src={p.url}
                    alt={`Photo ${i + 1}`}
                    className="h-28 w-full rounded-xl border border-border/60 object-cover"
                  />
                  {p.isCover && (
                    <Badge className="absolute start-2 top-2" tone="success">
                      Cover
                    </Badge>
                  )}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No photos submitted.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Documents</p>
          {documents.length ? (
            <div className="space-y-2">
              {documents.map((d) => (
                <div
                  key={d._id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-sm"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium capitalize">{d.category.replace('_', ' ')}</span>
                    <span className="block text-xs text-muted-foreground">
                      {d.verification?.status ?? 'pending'}
                      {d.expiresAt ? ` · expires ${formatDate(d.expiresAt)}` : ''}
                    </span>
                  </a>
                  {d.verification?.status !== 'verified' && (
                    <Button size="sm" variant="outline" loading={verifyDoc.isPending} onClick={() => verifyDoc.mutate(d._id)}>
                      Verify
                    </Button>
                  )}
                  <a href={d.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No documents uploaded.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-x-8 gap-y-3 py-5 sm:grid-cols-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground sm:col-span-2">
            What the host entered
          </p>
          <Row label="Daily price" value={formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })} />
          <Row
            label="Cleaning fee"
            value={v.pricing.cleaningFee ? formatMoney({ amount: v.pricing.cleaningFee, currency: v.pricing.currency }) : '—'}
          />
          <Row label="VIN" value={v.vin ?? '—'} />
          <Row label="Registration number" value={v.registrationNumber ?? '—'} />
          <Row label="Colour" value={v.specs?.color ?? '—'} />
          <Row label="Doors" value={v.specs?.doors != null ? String(v.specs.doors) : '—'} />
          <Row label="Odometer" value={v.specs?.mileageKm != null ? `${v.specs.mileageKm.toLocaleString()} km` : '—'} />
          <Row
            label="Mileage allowance"
            value={v.mileageLimit?.perDayKm ? `${v.mileageLimit.perDayKm} km/day` : 'Unlimited'}
          />
          <Row label="Address" value={v.location?.address ?? '—'} className="sm:col-span-2" />
          <Row label="Title" value={v.listing?.title ?? '—'} className="sm:col-span-2" />
          <Row label="Description" value={v.listing?.description ?? '—'} className="sm:col-span-2" />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
