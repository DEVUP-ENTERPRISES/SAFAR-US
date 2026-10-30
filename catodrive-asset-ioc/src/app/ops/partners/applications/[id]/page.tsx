'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, CheckCircle2, ImageOff, Mail, MessageSquareWarning, Phone, ShieldCheck, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { partnerManageApi, type ReviewDecision } from '@/features/asset-partners/manage-api';
import { APPLICATION_STATUS } from '@/features/asset-partners/status';
import type { ApplicationStatus } from '@/features/asset-partners/api';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { safeMessage } from '@/lib/utils/safe-message';
import { ApiError } from '@/lib/api/types';
import { ListingCard } from '~/features/partners/listing-card';

const manage = partnerManageApi('/ioc');

interface ApplicationDetail {
  _id: string;
  reference: string;
  status: ApplicationStatus;
  kind?: 'partner' | 'vehicle';
  vehicleId?: string;
  partnerId?: string;
  fullName: string; businessName?: string; partnerType: string; email: string; phone: string;
  address: string; city: string; state: string; zip: string; referral?: string;
  vehicle: { year: string; make: string; model: string; trim?: string; mileage: number; exteriorColor?: string; interiorColor?: string; vin: string; plate: string };
  ownership: string; lienholder?: string; lienAccountLast4?: string; estimatedMarketValue?: string;
  hadAccident: boolean; accidentDetail?: string; smokeFree: boolean; petFree: boolean; hasMaintenanceRecords?: boolean;
  photos: { url: string; label?: string }[];
  insurance: { carrier: string; policyNumber: string; coverageType: string; policyExpiry?: string };
  availability: string; preferredZone?: string; targetStartDate?: string; notes?: string;
  acknowledgedAccurate?: boolean; acknowledgedInspection?: boolean; acknowledgedTerms?: boolean;
  signature: string; signedAt: string;
  ip?: string; userAgent?: string;
  reviewedBy?: string; reviewedAt?: string; reviewNotes?: string; hostVerified?: boolean;
  createdAt: string;
}

// The slots the partner form asks for, in shooting order; anything else they sent follows.
const PHOTO_SLOTS = [
  { label: 'Front', required: true },
  { label: 'Odometer', required: true },
  { label: 'Rear', required: false },
  { label: 'Interior', required: false },
];
const PARTNER_TYPE: Record<string, string> = { individual: 'Individual', business: 'Business', fleet: 'Fleet' };
const OWNERSHIP: Record<string, string> = { owned: 'Owned outright', financed: 'Financed', leased: 'Leased' };
const COVERAGE: Record<string, string> = { full: 'Full coverage', liability: 'Liability only', unsure: 'Not sure' };
const AVAILABILITY: Record<string, string> = { fulltime: 'Full time', parttime: 'Part time', seasonal: 'Seasonal' };
const yesNo = (v?: boolean) => (v === undefined ? 'Not answered' : v ? 'Yes' : 'No');

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const { data: a, isLoading, isError, refetch } = useQuery({
    queryKey: ['asset-partner-application', id],
    queryFn: () => manage.application(id) as Promise<ApplicationDetail>,
  });

  const review = useMutation({
    mutationFn: ({ decision, notes, rejection }: { decision: ReviewDecision; notes?: string; rejection?: { reasons: string[]; improvements?: string; reapplyAfterDays?: number } }) =>
      manage.reviewApplication(id, decision, notes, rejection),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-partner-application', id] });
      qc.invalidateQueries({ queryKey: ['ioc-partner-applications'] });
      qc.invalidateQueries({ queryKey: ['ioc-partner-summary'] });
      qc.invalidateQueries({ queryKey: ['ioc-attention'] });
    },
  });

  const [declining, setDeclining] = useState(false);

  const decide = async (decision: ReviewDecision) => {
    if (decision === 'rejected') return setDeclining(true);
    const vehicle = a?.kind === 'vehicle';
    const copy: Record<ReviewDecision, { title: string; description: string; label: string }> = {
      approved: vehicle
        ? { title: `Approve this ${a?.vehicle.make} ${a?.vehicle.model}?`, description: 'The partner is told it is approved. Arrange the inspection and list the car as usual.', label: 'Approve car' }
        : { title: `Approve ${a?.fullName}?`, description: 'They become an Asset Partner and are asked to sign the agreement and add payout details before their dashboard opens.', label: 'Approve partner' },
      changes_requested: { title: 'Ask for changes?', description: 'The applicant sees your note, corrects the application and sends it again.', label: 'Send back' },
      rejected: { title: `Reject ${a?.fullName}?`, description: 'The applicant is told, with your note. This cannot be undone.', label: 'Reject' },
    };
    const { ok, reason } = await confirm({
      title: copy[decision].title,
      description: copy[decision].description,
      confirmLabel: copy[decision].label,
      tone: 'default',
      reason: decision === 'approved' ? { label: 'Note (optional)' } : { label: 'Note for the applicant', required: true },
    });
    if (ok) review.mutate({ decision, notes: reason || undefined });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }
  if (isError || !a) return <ErrorState message="We couldn’t load this application." retry={() => void refetch()} />;

  const decided = a.status === 'approved' || a.status === 'rejected';
  const byLabel = new Map(a.photos.map((p) => [p.label ?? '', p]));
  const extraPhotos = a.photos.filter((p) => !PHOTO_SLOTS.some((s) => s.label === p.label));
  const missingRequired = PHOTO_SLOTS.filter((s) => s.required && !byLabel.has(s.label)).length;
  const car = `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}${a.vehicle.trim ? ` ${a.vehicle.trim}` : ''}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to applications
      </button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{a.reference} · sent {formatDateTime(a.createdAt)}</p>
          <h1 className="display text-2xl">{a.fullName}</h1>
          <p className="text-sm text-muted-foreground">{[a.businessName, car].filter(Boolean).join(' · ')}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <a href={`mailto:${a.email}`} className="inline-flex h-9 items-center gap-2 rounded-sm border border-border px-3 text-sm font-medium hover:bg-accent"><Mail className="h-4 w-4" aria-hidden />{a.email}</a>
            <a href={`tel:${a.phone}`} className="inline-flex h-9 items-center gap-2 rounded-sm border border-border px-3 text-sm font-medium hover:bg-accent"><Phone className="h-4 w-4" aria-hidden />{a.phone}</a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.kind === 'vehicle' && <Badge>Extra car</Badge>}
          <Badge tone={APPLICATION_STATUS[a.status].tone}>{APPLICATION_STATUS[a.status].label}</Badge>
        </div>
      </header>

      {a.status === 'approved' && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
            <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 flex-1">
              {a.kind === 'vehicle'
                ? 'Approved. Inspect the car, record the intake report on the partner’s page, and put it on the fleet below.'
                : 'Approved. The partner now signs the agreement and uploads their papers in their portal.'}
            </span>
            {a.partnerId && <Link href={`/ops/partners/members/${a.partnerId}`} className="font-semibold text-primary underline-offset-2 hover:underline">Open partner</Link>}
          </CardContent>
        </Card>
      )}
      {a.status === 'approved' && <ListingCard applicationId={a._id} vehicleId={a.vehicleId} />}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Camera className="h-5 w-5 text-primary" aria-hidden />Photos</CardTitle>
          <span className="text-sm text-muted-foreground tabular-nums">
            {a.photos.length} sent{missingRequired > 0 ? ` · ${missingRequired} required missing` : ''}
          </span>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {PHOTO_SLOTS.map((s) => <PhotoTile key={s.label} label={s.label} url={byLabel.get(s.label)?.url} required={s.required} />)}
            {extraPhotos.map((p, i) => <PhotoTile key={`x${i}`} label={p.label || `Photo ${i + 1}`} url={p.url} />)}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Click a photo to open it full size.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Partner">
          <Row label="Joining as" value={PARTNER_TYPE[a.partnerType] ?? a.partnerType} />
          {a.businessName && <Row label="Business" value={a.businessName} />}
          <Row label="Email" value={a.email} />
          <Row label="Phone" value={a.phone} />
          <Row label="Address" value={`${a.address}, ${a.city}, ${a.state} ${a.zip}`} />
          {a.referral && <Row label="Heard about us" value={a.referral} />}
        </Section>

        <Section title="Car">
          <Row label="Car" value={car} />
          <Row label="Mileage" value={`${a.vehicle.mileage.toLocaleString('en-US')} mi`} />
          <Row label="VIN" value={a.vehicle.vin} mono />
          <Row label="Plate" value={a.vehicle.plate} mono />
          {(a.vehicle.exteriorColor || a.vehicle.interiorColor) && <Row label="Colour" value={[a.vehicle.exteriorColor, a.vehicle.interiorColor].filter(Boolean).join(' / ')} />}
        </Section>

        <Section title="Ownership">
          <Row label="The car is" value={OWNERSHIP[a.ownership] ?? a.ownership} />
          {a.lienholder && <Row label="Lienholder" value={a.lienholder} />}
          {a.lienAccountLast4 && <Row label="Loan account" value={`•••• ${a.lienAccountLast4}`} mono />}
          {a.estimatedMarketValue && <Row label="Estimated value" value={a.estimatedMarketValue} />}
        </Section>

        <Section title="Condition">
          <Row label="Accidents" value={a.hadAccident ? 'Yes' : 'No'} tone={a.hadAccident ? 'warning' : undefined} />
          {a.hadAccident && <Row label="What happened" value={a.accidentDetail || 'No detail given'} />}
          <Row label="Smoke-free" value={yesNo(a.smokeFree)} tone={a.smokeFree ? undefined : 'warning'} />
          <Row label="Pet-free" value={yesNo(a.petFree)} tone={a.petFree ? undefined : 'warning'} />
          {a.hasMaintenanceRecords !== undefined && <Row label="Service records" value={yesNo(a.hasMaintenanceRecords)} />}
        </Section>

        <Section title="Insurance">
          <Row label="Company" value={a.insurance.carrier} />
          <Row label="Policy number" value={a.insurance.policyNumber} mono />
          <Row label="Coverage" value={COVERAGE[a.insurance.coverageType] ?? a.insurance.coverageType} tone={a.insurance.coverageType === 'full' ? undefined : 'warning'} />
          {a.insurance.policyExpiry && <Row label="Policy ends" value={formatDate(a.insurance.policyExpiry)} />}
        </Section>

        <Section title="Availability">
          <Row label="Car available" value={AVAILABILITY[a.availability] ?? a.availability} />
          {a.preferredZone && <Row label="Preferred area" value={a.preferredZone} />}
          {a.targetStartDate && <Row label="Can start" value={formatDate(a.targetStartDate)} />}
          {a.notes && <Row label="Notes from partner" value={a.notes} />}
        </Section>
      </div>

      <Section title="Declaration">
        <Check2 ok={a.acknowledgedAccurate} label="Details are accurate" />
        <Check2 ok={a.acknowledgedInspection} label="Agrees to a physical inspection before the car goes live" />
        <Check2 ok={a.acknowledgedTerms} label="Can place this car with CatoDrive" />
        <Row label="Signed as" value={a.signature} />
        <Row label="Signed" value={formatDateTime(a.signedAt)} />
        {a.ip && <Row label="Sent from" value={a.ip} mono />}
        {a.userAgent && <Row label="Device" value={a.userAgent} small />}
      </Section>

      {a.reviewedAt && (
        <Section title="Review">
          <Row label="Decision" value={APPLICATION_STATUS[a.status].label} />
          <Row label="Reviewed" value={formatDateTime(a.reviewedAt)} />
          {a.reviewNotes && <Row label="Note" value={a.reviewNotes} />}
        </Section>
      )}

      {!decided && declining && (
        <DeclinePanel
          busy={review.isPending}
          error={review.isError ? (review.error instanceof ApiError ? review.error.message : 'That didn’t go through.') : undefined}
          onCancel={() => setDeclining(false)}
          onSubmit={(input) => review.mutate({ decision: 'rejected', notes: input.note, rejection: { reasons: input.reasons, improvements: input.improvements, reapplyAfterDays: input.reapplyAfterDays } }, { onSuccess: () => setDeclining(false) })}
        />
      )}

      {!decided && !declining && (
        <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-lg sm:flex-row sm:justify-end">
          <Button variant="outline" className="text-destructive hover:text-destructive" disabled={review.isPending} onClick={() => void decide('rejected')}>
            <XCircle className="h-4 w-4" aria-hidden /> Reject
          </Button>
          {a.status !== 'changes_requested' && (
            <Button variant="outline" disabled={review.isPending} onClick={() => void decide('changes_requested')}>
              <MessageSquareWarning className="h-4 w-4" aria-hidden /> Ask for changes
            </Button>
          )}
          <Button loading={review.isPending} onClick={() => void decide('approved')}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Approve
          </Button>
        </div>
      )}
      {review.isError && <p role="alert" className="text-sm text-destructive">{review.error instanceof Error ? safeMessage(review.error.message) : 'That didn’t work. Try again.'}</p>}
    </div>
  );
}

function PhotoTile({ label, url, required }: { label: string; url?: string; required?: boolean }) {
  return (
    <li className="min-w-0">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-sm border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${label} photo`} loading="lazy" className="aspect-[4/3] w-full bg-muted object-cover" />
        </a>
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border bg-muted/50 text-xs text-muted-foreground">
          <ImageOff className="h-5 w-5" aria-hidden />
          {required ? 'Required, not sent' : 'Not sent'}
        </div>
      )}
      <p className="mt-1.5 text-xs font-semibold">{label}</p>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2.5">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value, mono, small, tone }: { label: string; value: string; mono?: boolean; small?: boolean; tone?: 'warning' }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-words text-right ${small ? 'text-xs text-muted-foreground' : 'font-medium'} ${mono ? 'font-mono' : ''} ${tone === 'warning' ? 'text-warning' : ''}`}>{value}</span>
    </div>
  );
}

function Check2({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Yes" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="No" />}
      <span>{label}</span>
    </div>
  );
}

/** Declining: the reasons and advice the applicant will read, and when they may apply again. */
function DeclinePanel({ busy, error, onCancel, onSubmit }: { busy: boolean; error?: string; onCancel: () => void; onSubmit: (input: { reasons: string[]; note: string; improvements?: string; reapplyAfterDays?: number }) => void }) {
  const reasons = useQuery({ queryKey: ['ioc-rejection-reasons'], queryFn: () => manage.rejectionReasons(), staleTime: Infinity });
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [improvements, setImprovements] = useState('');
  const [wait, setWait] = useState('');
  return (
    <Card className="border-destructive/30">
      <CardHeader><CardTitle className="text-base">Decline this application</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">The applicant sees each reason with what would help, your note, and the date they can apply again.</p>
        {reasons.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : reasons.isError ? (
          <ErrorState message="We couldn’t load the reasons." retry={() => void reasons.refetch()} />
        ) : (
          <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-label font-semibold">Why (pick at least one)</legend>
            {(reasons.data ?? []).map((r) => (
              <label key={r.code} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={picked.includes(r.code)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.code] : picked.filter((x) => x !== r.code))} />
                <span><span className="font-medium">{r.label}</span><span className="block text-xs text-muted-foreground">{r.why}</span></span>
              </label>
            ))}
          </fieldset>
        )}
        <Field label="Note for the applicant" htmlFor="dec-note"><Textarea id="dec-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="What would change our answer (optional)" htmlFor="dec-improve" hint="For example: a 2018 or newer car under 80,000 miles."><Textarea id="dec-improve" rows={2} maxLength={1000} value={improvements} onChange={(e) => setImprovements(e.target.value)} /></Field>
        <Field label="They can apply again" htmlFor="dec-wait">
          <Select id="dec-wait" value={wait} onChange={(e) => setWait(e.target.value)}>
            <option value="">After the usual wait (set in Partner Terms)</option>
            <option value="0">Straight away</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="180">In 6 months</option>
            <option value="365">In a year</option>
          </Select>
        </Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>Back</Button>
          <Button variant="destructive" disabled={picked.length === 0 || note.trim().length < 3} loading={busy} onClick={() => onSubmit({ reasons: picked, note: note.trim(), improvements: improvements.trim() || undefined, reapplyAfterDays: wait === '' ? undefined : Number(wait) })}>
            Decline application
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
