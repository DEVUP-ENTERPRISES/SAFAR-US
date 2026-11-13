'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, CheckCircle2, ExternalLink, ImageOff, Mail, MapPin, MessageSquareWarning, Phone, ShieldCheck, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils/cn';
import { ListingCard } from '~/features/partners/listing-card';
import { LocationMap } from '@/features/maps/components/location-map';
import { DownloadButton } from '~/features/partners/download-button';

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
  ownership: string; titleStatus?: string; lienholder?: string; lienAccountLast4?: string; estimatedMarketValue?: string;
  hadAccident: boolean; accidentDetail?: string; smokeFree?: boolean; petFree?: boolean; hasMaintenanceRecords?: boolean;
  photos: { url: string; label?: string }[];
  insurance?: { carrier?: string; policyNumber?: string; coverageType?: string; policyExpiry?: string };
  availability: string; seasonMonths?: number; preferredZone?: string; targetStartDate?: string; notes?: string;
  acknowledgedAccurate?: boolean; acknowledgedInspection?: boolean; acknowledgedTerms?: boolean;
  signature: string; signedAt: string;
  ip?: string; userAgent?: string;
  reviewedBy?: string; reviewedAt?: string; reviewNotes?: string; hostVerified?: boolean;
  changeRequest?: { items: { key: string; label?: string; note?: string }[]; note?: string; requestedAt: string };
  resubmission?: { at: string; changed: string[]; before: Record<string, unknown> };
  geo?: { lat?: number; lng?: number; formatted?: string; matched: boolean; checkedAt: string };
  submittedFrom?: { lat: number; lng: number; accuracyM?: number; at: string };
  submittedFromMiles?: number;
  createdAt: string;
}

const mapsLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/** The typed address on a real map, and how far away the applicant was when they applied. */
function AddressCheck({ a }: { a: ApplicationDetail }) {
  const typed = `${a.address}, ${a.city}, ${a.state} ${a.zip}`;
  const found = a.geo?.matched && a.geo.lat != null && a.geo.lng != null;
  const miles = a.submittedFromMiles;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" aria-hidden /> Address check</CardTitle>
        {!a.geo?.checkedAt ? <Badge tone="muted">Not checked yet</Badge> : found ? <Badge tone="success">Found on the map</Badge> : <Badge tone="warning">Couldn’t find this address</Badge>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p><span className="font-medium">{typed}</span>{found && a.geo?.formatted && a.geo.formatted !== typed && <span className="block text-muted-foreground">Map: {a.geo.formatted}</span>}</p>
        {found && <LocationMap lat={a.geo!.lat!} lng={a.geo!.lng!} label={a.fullName} zoom={14} className="h-56 w-full overflow-hidden rounded-lg" />}
        {miles !== undefined ? (
          <p className="rounded-lg bg-subtle p-3">
            Applied from <span className="font-semibold tabular-nums">{miles < 1 ? 'less than a mile' : `${miles.toLocaleString('en-US')} miles`}</span> away{a.submittedFrom?.accuracyM ? <span className="text-muted-foreground"> (device accurate to about {Math.round(a.submittedFrom.accuracyM).toLocaleString('en-US')} m)</span> : null}.
          </p>
        ) : (
          <p className="text-muted-foreground">{a.submittedFrom ? 'The address couldn’t be placed, so the distance is unknown.' : 'They didn’t share their location when applying.'}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <a href={mapsLink(typed)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-sm border border-border px-3 font-medium hover:bg-accent"><ExternalLink className="h-4 w-4" aria-hidden />Open in Google Maps</a>
          {a.submittedFrom && <a href={mapsLink(`${a.submittedFrom.lat},${a.submittedFrom.lng}`)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-sm border border-border px-3 font-medium hover:bg-accent"><ExternalLink className="h-4 w-4" aria-hidden />Where they applied from</a>}
        </div>
      </CardContent>
    </Card>
  );
}

// The slots the partner form asks for, in shooting order; anything else they sent follows.
const PHOTO_SLOTS = [
  { label: 'Front', required: true },
  { label: 'Rear', required: true },
  { label: 'Odometer', required: true },
  { label: 'Interior', required: false },
];
const FIELD_NAMES: Record<string, string> = {
  vin: 'VIN', year: 'Year', make: 'Make', model: 'Model', trim: 'Trim', mileage: 'Mileage', plate: 'Plate', ownership: 'Car is', lienholder: 'Lender',
  titleStatus: 'Title', hadAccident: 'Accidents', accidentDetail: 'What happened', carrier: 'Insurer', policyNumber: 'Policy number', coverageType: 'Coverage',
  policyExpiry: 'Policy ends', availability: 'Available', seasonMonths: 'Months', fullName: 'Name', businessName: 'Business', partnerType: 'Joining as',
  phone: 'Phone', address: 'Address', city: 'City', state: 'State', zip: 'ZIP',
};
// How a field item looked before the partner changed it, in one plain line.
const describe = (v: unknown) =>
  v && typeof v === 'object'
    ? Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null && x !== '').map(([k, x]) => `${FIELD_NAMES[k] ?? k}: ${typeof x === 'boolean' ? (x ? 'Yes' : 'No') : String(x)}`).join(' · ') || 'Nothing given'
    : 'Nothing given';
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
    mutationFn: ({ decision, notes, rejection, joiningFeeCents, changes }: { decision: ReviewDecision; notes?: string; rejection?: { reasons: string[]; improvements?: string; reapplyAfterDays?: number }; joiningFeeCents?: number; changes?: { key: string; note?: string }[] }) =>
      manage.reviewApplication(id, decision, notes, rejection, joiningFeeCents, changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-partner-application', id] });
      qc.invalidateQueries({ queryKey: ['ioc-partner-applications'] });
      qc.invalidateQueries({ queryKey: ['ioc-partner-summary'] });
      qc.invalidateQueries({ queryKey: ['ioc-attention'] });
    },
  });

  const [declining, setDeclining] = useState(false);
  const [approving, setApproving] = useState(false);
  const [asking, setAsking] = useState(false);
  const catalogue = useQuery({ queryKey: ['ioc-change-items'], queryFn: () => manage.changeItems(), staleTime: Infinity });
  const labelOf = (key: string) => catalogue.data?.find((c) => c.key === key)?.label ?? key;

  const decide = async (decision: ReviewDecision) => {
    if (decision === 'rejected') return setDeclining(true);
    // A new partner's approval also sets their one-time fee.
    if (decision === 'approved' && a?.kind !== 'vehicle') return setApproving(true);
    if (decision === 'changes_requested') return setAsking(true);
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
  // Highlight only what the latest resubmission changed, once it is back with ops.
  const changedKeys = new Set(a.status !== 'changes_requested' ? a.resubmission?.changed ?? [] : []);
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
        <div className="flex flex-wrap items-center gap-2">
          {a.kind === 'vehicle' && <Badge>Extra car</Badge>}
          <Badge tone={APPLICATION_STATUS[a.status].tone}>{APPLICATION_STATUS[a.status].label}</Badge>
          <DownloadButton onClick={() => manage.exportApplication(a._id)} label="Download" />
        </div>
      </header>

      <AddressCheck a={a} />

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

      {a.status === 'changes_requested' && a.changeRequest?.items.length ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="font-semibold">Waiting for the partner to change:</p>
            <ul className="list-inside list-disc space-y-1">
              {a.changeRequest.items.map((i) => <li key={i.key}>{i.label ?? labelOf(i.key)}{i.note ? <span className="text-muted-foreground"> · {i.note}</span> : null}</li>)}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {a.resubmission && a.status !== 'changes_requested' && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2"><CardTitle className="text-base">Sent again {formatDateTime(a.resubmission.at)}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">Only these were changed; everything else is as you reviewed it before. Changed items are highlighted below.</p>
            <ul className="space-y-1.5">
              {a.resubmission.changed.map((k) => (
                <li key={k} className="min-w-0">
                  <span className="font-medium">{labelOf(k)}</span>
                  {!k.startsWith('photo:') && !k.startsWith('paper:') && <span className="block break-words text-xs text-muted-foreground">Before: {describe(a.resubmission!.before[k])}</span>}
                  {k.startsWith('paper:') && <span className="block text-xs text-muted-foreground">A new file was uploaded; check it on the partner’s documents.</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Camera className="h-5 w-5 text-primary" aria-hidden />Photos</CardTitle>
          <span className="text-sm text-muted-foreground tabular-nums">
            {a.photos.length} sent{missingRequired > 0 ? ` · ${missingRequired} required missing` : ''}
          </span>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {PHOTO_SLOTS.map((s) => {
              const changed = changedKeys.has(`photo:${s.label}`);
              const was = changed ? (a.resubmission?.before[`photo:${s.label}`] as { url?: string } | null)?.url : undefined;
              return <PhotoTile key={s.label} label={s.label} url={byLabel.get(s.label)?.url} required={s.required} changed={changed} beforeUrl={was} />;
            })}
            {extraPhotos.map((p, i) => <PhotoTile key={`x${i}`} label={p.label || `Photo ${i + 1}`} url={p.url} />)}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Click a photo to open it full size.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Partner" changed={changedKeys.has('contact')}>
          <Row label="Joining as" value={PARTNER_TYPE[a.partnerType] ?? a.partnerType} />
          {a.businessName && <Row label="Business" value={a.businessName} />}
          <Row label="Email" value={a.email} />
          <Row label="Phone" value={a.phone} />
          <Row label="Address" value={`${a.address}, ${a.city}, ${a.state} ${a.zip}`} />
          {a.referral && <Row label="Heard about us" value={a.referral} />}
        </Section>

        <Section title="Car" changed={changedKeys.has('details')}>
          <Row label="Car" value={car} />
          <Row label="Mileage" value={`${a.vehicle.mileage.toLocaleString('en-US')} mi`} />
          <Row label="VIN" value={a.vehicle.vin} mono />
          <Row label="Plate" value={a.vehicle.plate} mono />
          {(a.vehicle.exteriorColor || a.vehicle.interiorColor) && <Row label="Colour" value={[a.vehicle.exteriorColor, a.vehicle.interiorColor].filter(Boolean).join(' / ')} />}
        </Section>

        <Section title="Ownership" changed={changedKeys.has('ownership')}>
          <Row label="The car is" value={OWNERSHIP[a.ownership] ?? a.ownership} />
          {a.titleStatus && <Row label="Title" value={a.titleStatus === 'clean' ? 'Clean' : a.titleStatus} tone={a.titleStatus === 'clean' ? undefined : 'warning'} />}
          {a.lienholder && <Row label="Lienholder" value={a.lienholder} />}
          {a.lienAccountLast4 && <Row label="Loan account" value={`•••• ${a.lienAccountLast4}`} mono />}
          {a.estimatedMarketValue && <Row label="Estimated value" value={a.estimatedMarketValue} />}
        </Section>

        <Section title="Condition" changed={changedKeys.has('condition')}>
          <Row label="Accidents" value={a.hadAccident ? 'Yes' : 'No'} tone={a.hadAccident ? 'warning' : undefined} />
          {a.hadAccident && <Row label="What happened" value={a.accidentDetail || 'No detail given'} />}
          {a.smokeFree !== undefined && <Row label="Smoke-free" value={yesNo(a.smokeFree)} tone={a.smokeFree ? undefined : 'warning'} />}
          {a.petFree !== undefined && <Row label="Pet-free" value={yesNo(a.petFree)} tone={a.petFree ? undefined : 'warning'} />}
          {a.hasMaintenanceRecords !== undefined && <Row label="Service records" value={yesNo(a.hasMaintenanceRecords)} />}
        </Section>

        <Section title="Insurance" changed={changedKeys.has('insurance')}>
          {!a.insurance?.policyNumber && <Row label="Policy" value="Skipped; asked for under Documents after approval" tone="warning" />}
          {a.insurance?.carrier && <Row label="Company" value={a.insurance.carrier} />}
          {a.insurance?.policyNumber && <Row label="Policy number" value={a.insurance.policyNumber} mono />}
          {a.insurance?.coverageType && <Row label="Coverage" value={COVERAGE[a.insurance.coverageType] ?? a.insurance.coverageType} tone={a.insurance.coverageType === 'full' ? undefined : 'warning'} />}
          {a.insurance?.policyExpiry && <Row label="Policy ends" value={formatDate(a.insurance.policyExpiry)} />}
        </Section>

        <Section title="Availability" changed={changedKeys.has('availability')}>
          <Row label="Car available" value={`${AVAILABILITY[a.availability] ?? a.availability}${a.availability === 'seasonal' && a.seasonMonths ? `, ${a.seasonMonths} months` : ''}`} />
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

      {!decided && asking && (
        <ChangesPanel
          items={(catalogue.data ?? []).filter((i) => a.kind !== 'vehicle' || i.key !== 'contact')}
          loading={catalogue.isLoading}
          failed={catalogue.isError}
          retry={() => void catalogue.refetch()}
          busy={review.isPending}
          error={review.isError ? (review.error instanceof ApiError ? review.error.message : 'That didn’t go through.') : undefined}
          onCancel={() => setAsking(false)}
          onSubmit={(input) => review.mutate({ decision: 'changes_requested', notes: input.note || undefined, changes: input.changes }, { onSuccess: () => setAsking(false) })}
        />
      )}

      {!decided && approving && (
        <ApprovePanel
          name={a.fullName}
          busy={review.isPending}
          error={review.isError ? (review.error instanceof ApiError ? review.error.message : 'That didn’t go through.') : undefined}
          onCancel={() => setApproving(false)}
          onSubmit={(input) => review.mutate({ decision: 'approved', notes: input.note || undefined, joiningFeeCents: input.feeCents }, { onSuccess: () => setApproving(false) })}
        />
      )}

      {!decided && !declining && !approving && !asking && (
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

function PhotoTile({ label, url, required, changed, beforeUrl }: { label: string; url?: string; required?: boolean; changed?: boolean; beforeUrl?: string }) {
  return (
    <li className={cn('min-w-0', changed && 'rounded-sm ring-2 ring-primary ring-offset-2 ring-offset-background')}>
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
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
        {label}
        {changed && <Badge>Changed</Badge>}
        {beforeUrl && <a href={beforeUrl} target="_blank" rel="noopener noreferrer" className="font-normal text-primary underline-offset-2 hover:underline">See before</a>}
      </p>
    </li>
  );
}

function Section({ title, changed, children }: { title: string; changed?: boolean; children: React.ReactNode }) {
  return (
    <Card className={cn('min-w-0', changed && 'border-primary ring-1 ring-primary')}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3"><CardTitle className="text-base">{title}</CardTitle>{changed && <Badge>Changed</Badge>}</CardHeader>
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
function ChangesPanel({ items, loading, failed, retry, busy, error, onCancel, onSubmit }: {
  items: { key: string; label: string }[]; loading: boolean; failed: boolean; retry: () => void; busy: boolean; error?: string;
  onCancel: () => void; onSubmit: (input: { note: string; changes: { key: string; note?: string }[] }) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const keys = Object.keys(picked);
  const toggle = (key: string, on: boolean) => setPicked((p) => {
    const next = { ...p };
    if (on) next[key] = '';
    else delete next[key];
    return next;
  });
  return (
    <Card className="border-warning/40">
      <CardHeader><CardTitle className="text-base">Ask for changes</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Tick exactly what needs redoing. The partner sees only these, can’t send it back until each one is changed, and you’ll see what changed.</p>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : failed ? (
          <ErrorState message="We couldn’t load the list." retry={retry} />
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-label font-semibold">What needs changing</legend>
            {items.map((i) => (
              <div key={i.key} className="rounded-lg border border-border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={i.key in picked} onChange={(e) => toggle(i.key, e.target.checked)} />
                  <span className="font-medium">{i.label}</span>
                </label>
                {i.key in picked && (
                  <Input className="mt-2" placeholder="What’s wrong (optional), e.g. too dark, plate not visible" maxLength={300} aria-label={`Note for ${i.label}`}
                    value={picked[i.key]} onChange={(e) => setPicked((p) => ({ ...p, [i.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </fieldset>
        )}
        <Field label="Note for the applicant (optional)" htmlFor="chg-note"><Textarea id="chg-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>Back</Button>
          <Button disabled={!keys.length} loading={busy} onClick={() => onSubmit({ note: note.trim(), changes: keys.map((k) => ({ key: k, note: picked[k].trim() || undefined })) })}>
            <MessageSquareWarning className="h-4 w-4" aria-hidden /> Send back {keys.length ? `(${keys.length})` : ''}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApprovePanel({ name, busy, error, onCancel, onSubmit }: { name: string; busy: boolean; error?: string; onCancel: () => void; onSubmit: (input: { feeCents: number; note: string }) => void }) {
  const settings = useQuery({ queryKey: ['ioc-fee-settings'], queryFn: () => manage.joiningFeeSettings(), staleTime: 60_000 });
  const [amount, setAmount] = useState('');
  const [waive, setWaive] = useState(false);
  const [note, setNote] = useState('');
  const feesOn = settings.data?.enabled !== false;
  const platform = settings.data?.platformFeeCents ?? 0;
  const cents = waive || !feesOn ? 0 : Math.round(Number(amount) * 100);
  const valid = !feesOn || waive || (amount.trim() !== '' && Number.isFinite(cents) && cents > 0 && cents <= 500_000);
  const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  return (
    <Card className="border-primary/30">
      <CardHeader><CardTitle className="text-base">Approve {name}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">They become an Asset Partner. After the ID check they pay this one-time registration, then sign and add payout details. It covers every car they place.</p>
        {settings.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : settings.isError ? (
          <ErrorState message="We couldn’t load the fee settings." retry={() => void settings.refetch()} />
        ) : !feesOn ? (
          <p className="rounded-lg bg-subtle p-3 text-sm">Registration fees are switched off in Partner Terms, so this partner pays nothing.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr] sm:items-end">
              <Field label="Total registration fee (USD)" htmlFor="fee">
                <Input id="fee" type="number" inputMode="decimal" min="1" max="5000" step="0.01" placeholder="e.g. 350" disabled={waive} value={waive ? '' : amount} onChange={(e) => setAmount(e.target.value)} className="tabular-nums" />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
                No fee for this partner
              </label>
            </div>
            {cents > 0 && (
              <p className="rounded-lg bg-subtle p-3 text-sm tabular-nums">
                The partner pays <span className="font-semibold">{usd(cents)}</span> once, non-refundable{platform > 0 && cents > platform ? `, including the ${usd(platform)} platform fee` : ''}.
              </p>
            )}
          </div>
        )}
        <Field label="Note (optional)" htmlFor="apr-note"><Textarea id="apr-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>Back</Button>
          <Button disabled={!valid || settings.isLoading} loading={busy} onClick={() => onSubmit({ feeCents: cents, note: note.trim() })}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {cents > 0 ? `Approve, partner pays ${usd(cents)}` : 'Approve, no fee'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
