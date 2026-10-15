'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, MessageSquareWarning, XCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { partnerManageApi, type ReviewDecision } from '@/features/asset-partners/manage-api';
import { APPLICATION_STATUS } from '@/features/asset-partners/status';
import type { ApplicationStatus } from '@/features/asset-partners/api';

const manage = partnerManageApi('/ioc');
import { formatDate } from '@/lib/utils/format';

interface ApplicationDetail {
  _id: string;
  reference: string;
  status: ApplicationStatus;
  kind?: 'partner' | 'vehicle';
  fullName: string; businessName?: string; partnerType: string; email: string; phone: string;
  address: string; city: string; state: string; zip: string; referral?: string;
  vehicle: { year: string; make: string; model: string; trim?: string; mileage: number; exteriorColor?: string; interiorColor?: string; vin: string; plate: string };
  ownership: string; lienholder?: string; lienAccountLast4?: string; estimatedMarketValue?: string;
  hadAccident: boolean; accidentDetail?: string; smokeFree: boolean; petFree: boolean; hasMaintenanceRecords?: boolean;
  photos: { url: string; label?: string }[];
  insurance: { carrier: string; policyNumber: string; coverageType: string; policyExpiry?: string };
  availability: string; preferredZone?: string; targetStartDate?: string; notes?: string;
  signature: string; signedAt: string;
  reviewedBy?: string; reviewedAt?: string; reviewNotes?: string; hostVerified?: boolean;
  createdAt: string;
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const { data: a, isLoading, isError } = useQuery({
    queryKey: ['asset-partner-application', id],
    queryFn: () => manage.application(id) as Promise<ApplicationDetail>,
  });

  const review = useMutation({
    mutationFn: ({ decision, notes }: { decision: ReviewDecision; notes?: string }) => manage.reviewApplication(id, decision, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-partner-application', id] });
      qc.invalidateQueries({ queryKey: ['ioc-partner-applications'] });
      qc.invalidateQueries({ queryKey: ['ioc-partner-summary'] });
    },
  });

  const decide = async (decision: ReviewDecision) => {
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
      tone: decision === 'rejected' ? 'destructive' : 'default',
      reason: decision === 'approved' ? { label: 'Note (optional)' } : { label: 'Note for the applicant', required: true },
    });
    if (ok) review.mutate({ decision, notes: reason || undefined });
  };

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (isError || !a) return <ErrorState message="Application not found." />;

  const decided = a.status === 'approved' || a.status === 'rejected';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to applications
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{a.reference}</p>
          <h1 className="display text-2xl">{a.fullName}</h1>
          {a.businessName && <p className="text-sm text-muted-foreground">{a.businessName}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {a.kind === 'vehicle' && <Badge>Extra car</Badge>}
          <Badge tone={APPLICATION_STATUS[a.status].tone}>{APPLICATION_STATUS[a.status].label}</Badge>
        </div>
      </div>

      {a.status === 'approved' && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            {a.kind === 'vehicle'
              ? 'Approved. Arrange the inspection and list this car under the partner.'
              : 'Approved. The partner now signs the agreement and adds payout details in their portal.'}
          </CardContent>
        </Card>
      )}

      <Section title="Partner information">
        <Row label="Type" value={a.partnerType} />
        <Row label="Email" value={a.email} />
        <Row label="Phone" value={a.phone} />
        <Row label="Address" value={`${a.address}, ${a.city}, ${a.state} ${a.zip}`} />
        {a.referral && <Row label="Referral" value={a.referral} />}
      </Section>

      <Section title="Vehicle">
        <Row label="Vehicle" value={`${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}${a.vehicle.trim ? ' ' + a.vehicle.trim : ''}`} />
        <Row label="Mileage" value={a.vehicle.mileage.toLocaleString()} />
        <Row label="Color" value={[a.vehicle.exteriorColor, a.vehicle.interiorColor].filter(Boolean).join(' / ') || '—'} />
        <Row label="VIN" value={a.vehicle.vin} mono />
        <Row label="Plate" value={a.vehicle.plate} />
      </Section>

      <Section title="Ownership & title">
        <Row label="Ownership" value={a.ownership} />
        {a.lienholder && <Row label="Lienholder" value={a.lienholder} />}
        {a.estimatedMarketValue && <Row label="Est. value" value={a.estimatedMarketValue} />}
      </Section>

      <Section title="Condition">
        <Row label="Accident history" value={a.hadAccident ? `Yes — ${a.accidentDetail || 'no detail given'}` : 'No'} />
        <Row label="Smoke-free" value={a.smokeFree ? 'Yes' : 'No'} />
        <Row label="Pet-free" value={a.petFree ? 'Yes' : 'No'} />
        {a.photos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {a.photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
                <img src={p.url} alt={p.label || 'vehicle photo'} className="aspect-square w-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </Section>

      <Section title="Insurance">
        <Row label="Carrier" value={a.insurance.carrier} />
        <Row label="Policy #" value={a.insurance.policyNumber} />
        <Row label="Coverage" value={a.insurance.coverageType} />
      </Section>

      <Section title="Preferences">
        <Row label="Availability" value={a.availability} />
        {a.preferredZone && <Row label="Zone" value={a.preferredZone} />}
        {a.notes && <Row label="Notes" value={a.notes} />}
        <Row label="Signed" value={`${a.signature} · ${formatDate(a.signedAt)}`} />
      </Section>

      {a.reviewedAt && (
        <Section title="Review">
          <Row label="Decision" value={APPLICATION_STATUS[a.status].label} />
          <Row label="Reviewed" value={formatDate(a.reviewedAt)} />
          {a.reviewNotes && <Row label="Notes" value={a.reviewNotes} />}
        </Section>
      )}

      {!decided && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button loading={review.isPending} onClick={() => void decide('approved')}>
            <CheckCircle2 className="h-4 w-4" /> Approve
          </Button>
          {a.status !== 'changes_requested' && (
            <Button variant="outline" disabled={review.isPending} onClick={() => void decide('changes_requested')}>
              <MessageSquareWarning className="h-4 w-4" /> Ask for changes
            </Button>
          )}
          <Button variant="outline" className="text-destructive" disabled={review.isPending} onClick={() => void decide('rejected')}>
            <XCircle className="h-4 w-4" /> Reject
          </Button>
        </div>
      )}
      {review.isError && <p role="alert" className="text-sm text-destructive">{review.error instanceof Error ? review.error.message : 'That didn’t work'}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2.5">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-words text-right font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
