'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Mail, Phone, Building2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/utils/format';
import { assetPartnerApi } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';

/**
 * Where the partner's money goes, and their programme terms.
 *
 * Terms (management fee, insurance, detailing, payout day, check vs Zelle) are
 * a negotiated agreement — this page shows them but never edits them, the same
 * separation the backend enforces (setPayoutDetails vs the admin-only
 * setTerms). What IS the partner's to keep current is the recipient detail
 * that term requires: the mailing address or the Zelle handle.
 */
export default function PartnerProfilePage() {
  const qc = useQueryClient();
  const toast = useToast();

  // Contact-on-file (name, email, phone) still comes from the application —
  // that is where it was actually typed. Payout details come from /me, the
  // only endpoint that returns the SAVED value rather than a dashboard
  // summary — the form below has to start from real data, not blank fields.
  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ['asset-partner-dashboard'],
    queryFn: () => assetPartnerApi.dashboard(),
  });
  const me = useQuery({
    queryKey: ['asset-partner-me'],
    queryFn: () => assetPartnerApi.me(),
  });

  const [mailingAddress, setMailingAddress] = useState('');
  const [zelleHandle, setZelleHandle] = useState('');
  const [touched, setTouched] = useState(false);

  // Pre-fill exactly once the real data arrives — after that, the partner's
  // own typing owns the fields, so a background refetch can't clobber a
  // draft mid-edit.
  if (!touched && me.data?.partner.payoutDetails) {
    if (mailingAddress === '' && me.data.partner.payoutDetails.mailingAddress) {
      setMailingAddress(me.data.partner.payoutDetails.mailingAddress);
    }
    if (zelleHandle === '' && me.data.partner.payoutDetails.zelleHandle) {
      setZelleHandle(me.data.partner.payoutDetails.zelleHandle);
    }
  }

  const terms = me.data?.terms;

  const savePayout = useMutation({
    mutationFn: () => assetPartnerApi.setPayoutDetails({ mailingAddress, zelleHandle }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-partner-me'] });
      toast({ tone: 'success', title: 'Payout details saved' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' }),
  });

  if (dashLoading || me.isLoading) {
    return (
      <div className="space-y-6 py-8">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (me.isError || !dash) {
    return (
      <div className="py-8">
        <ErrorState message="We couldn’t load your profile." retry={() => me.refetch()} />
      </div>
    );
  }

  if (!me.data?.partner) {
    return (
      <div className="space-y-6 py-8">
        <PageHeader eyebrow="Asset Partners" title="Payout & profile" />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This opens once your application is approved and you’re enrolled in the programme.
          </CardContent>
        </Card>
      </div>
    );
  }

  const partner = me.data.partner;
  const partnerApp = dash.applications[0];

  return (
    <div className="space-y-6 py-8">
      <PageHeader
        eyebrow="Asset Partners"
        title="Payout & profile"
        description="Where your monthly net goes, and the terms it’s calculated on."
      />

      {/* Contact — read-only here. Account-level identity is managed on the
          main account page; duplicating an editable copy here is how two
          records go stale in different directions. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact on file</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <InfoRow icon={<Building2 className="h-4 w-4" />} label="Name" value={partner.displayName} />
          {partnerApp?.email && (
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={partnerApp.email} />
          )}
          {partnerApp?.phone && (
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={partnerApp.phone} />
          )}
          <p className="col-span-full flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> To correct your name, email or phone,
            update your <a href="/account" className="font-medium text-primary underline">account settings</a>.
          </p>
        </CardContent>
      </Card>

      {/* Terms — display only. */}
      {terms && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-lg">
              Programme terms
              {terms.negotiated && <Badge tone="warning">Negotiated</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TermRow label="Management fee" value={`${terms.managementFeeBps / 100}%`} />
            <TermRow label="Fleet insurance" value={`${formatMoney({ amount: terms.insuranceMonthlyCents, currency: 'USD' })}/mo per vehicle`} />
            <TermRow label="Detailing" value={`${formatMoney({ amount: terms.detailingMonthlyCents, currency: 'USD' })}/mo per vehicle`} />
            <TermRow label="Your deductible cap" value={`${formatMoney({ amount: terms.deductibleCapCents, currency: 'USD' })} per incident`} />
            <TermRow label="Approval needed above" value={formatMoney({ amount: terms.maintenanceApprovalCents, currency: 'USD' })} />
            <TermRow label="Paid on" value={`the ${terms.payoutDayOfMonth}${ordinal(terms.payoutDayOfMonth)} of each month`} />
          </CardContent>
        </Card>
      )}

      {/* Payout recipient — the only thing on this page the partner can edit. */}
      <PayoutDetailsCard
        method={terms?.payoutMethod}
        mailingAddress={mailingAddress}
        setMailingAddress={(v) => { setTouched(true); setMailingAddress(v); }}
        zelleHandle={zelleHandle}
        setZelleHandle={(v) => { setTouched(true); setZelleHandle(v); }}
        onSave={() => savePayout.mutate()}
        saving={savePayout.isPending}
      />
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ordinal(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'st';
  if (n % 10 === 2 && n % 100 !== 12) return 'nd';
  if (n % 10 === 3 && n % 100 !== 13) return 'rd';
  return 'th';
}

function PayoutDetailsCard({
  method,
  mailingAddress,
  setMailingAddress,
  zelleHandle,
  setZelleHandle,
  onSave,
  saving,
}: {
  method?: 'check' | 'zelle';
  mailingAddress: string;
  setMailingAddress: (v: string) => void;
  zelleHandle: string;
  setZelleHandle: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5 text-primary" /> Where your money goes
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          You’re paid by <span className="font-semibold capitalize">{method ?? 'check'}</span>. Keep
          this current — a wrong address or handle delays your payout.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {(!method || method === 'check') && (
          <Field label="Mailing address" hint="Where we send your check.">
            <Textarea
              rows={3}
              value={mailingAddress}
              onChange={(e) => setMailingAddress(e.target.value)}
              placeholder="123 Main St, Apt 4B, Dallas, TX 75201"
            />
          </Field>
        )}
        {method === 'zelle' && (
          <Field label="Zelle handle" hint="The email or phone your Zelle account uses.">
            <Input
              value={zelleHandle}
              onChange={(e) => setZelleHandle(e.target.value)}
              placeholder="you@example.com or (214) 555-0142"
            />
          </Field>
        )}
        <Button loading={saving} onClick={onSave}>
          Save payout details
        </Button>
      </CardContent>
    </Card>
  );
}
