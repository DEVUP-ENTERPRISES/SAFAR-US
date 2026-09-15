'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { adminApi } from '@/features/admin/api';
import { formatDate } from '@/lib/utils/format';

interface ApplicationDetail {
  _id: string;
  reference: string;
  status: string;
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

const TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted'> = {
  approved: 'success', submitted: 'warning', under_review: 'warning', rejected: 'destructive',
};

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const { data: a, isLoading, isError } = useQuery({
    queryKey: ['asset-partner-application', id],
    queryFn: () => adminApi.assetPartnerApplication(id) as Promise<ApplicationDetail>,
  });

  const review = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') => adminApi.reviewAssetPartnerApplication(id, decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-partner-application', id] });
      qc.invalidateQueries({ queryKey: ['asset-partner-applications'] });
    },
  });

  const decide = async (decision: 'approved' | 'rejected') => {
    const { ok } = await confirm({
      title: decision === 'approved' ? `Approve ${a?.fullName}?` : `Reject ${a?.fullName}?`,
      description: decision === 'approved'
        ? 'Their CatoDrive account (if one exists for this email) will be verified as a host, unlocking vehicle listing. If no account exists yet, they’ll need to register before this takes effect.'
        : 'This application will be marked rejected. The applicant is not notified automatically.',
      confirmLabel: decision === 'approved' ? 'Approve application' : 'Reject application',
      tone: decision === 'approved' ? 'default' : 'destructive',
    });
    if (ok) review.mutate(decision);
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
        <Badge tone={TONE[a.status]}>{a.status.replace('_', ' ')}</Badge>
      </div>

      {a.status === 'approved' && (
        <Card className={a.hostVerified ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'}>
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            {a.hostVerified
              ? 'Host account verified — this partner can now list a vehicle.'
              : `No CatoDrive account exists yet for ${a.email}. Once they register, revisit this application or verify their host manually.`}
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
          <Row label="Decision" value={a.status} />
          <Row label="Reviewed" value={formatDate(a.reviewedAt)} />
          {a.reviewNotes && <Row label="Notes" value={a.reviewNotes} />}
        </Section>
      )}

      {!decided && (
        <div className="flex gap-3">
          <Button loading={review.isPending} onClick={() => decide('approved')}>
            <CheckCircle2 className="h-4 w-4" /> Approve
          </Button>
          <Button variant="outline" className="text-destructive" loading={review.isPending} onClick={() => decide('rejected')}>
            <XCircle className="h-4 w-4" /> Reject
          </Button>
        </div>
      )}
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
      <span className={`text-right font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
