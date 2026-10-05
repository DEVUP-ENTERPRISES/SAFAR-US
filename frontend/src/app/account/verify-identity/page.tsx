'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, IdCard, ScanFace, LockKeyhole, CheckCircle2, XCircle,
  Clock, ArrowLeft, Camera, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils/format';
import { accountApi } from '@/features/account/api';
import { kycApi, type KycStatusView } from '@/features/kyc/api';
import { openIdentityModal } from '@/features/kyc/stripe-identity';
import { useStripePublishableKey } from '@/features/payments/stripe-key';
import { uploadFiles } from '@/features/media/upload';
import { LiveCamera } from '@/features/trips/components/live-camera';
import { ApiError } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';

const isDev = process.env.NODE_ENV !== 'production';

const STEPS = [
  {
    icon: IdCard,
    title: "Photograph your driver's licence",
    detail: 'Front and back. Sharp, well-lit, no glare.',
  },
  {
    icon: ScanFace,
    title: 'Take a quick selfie',
    detail: "We match your face to the licence to confirm it's really you.",
  },
  {
    icon: LockKeyhole,
    title: 'We confirm and secure it',
    detail: 'Documents are visible only to our verification team — never to hosts.',
  },
];

// ── Status badge ──────────────────────────────────────────────────────────────

type StatusKey = 'not_started' | 'pending' | 'approved' | 'rejected';

function StatusPill({ status }: { status: StatusKey | string }) {
  const map: Record<string, { label: string; icon: React.ElementType; tone: 'default' | 'success' | 'warning' | 'destructive' | 'muted' }> = {
    not_started: { label: 'Not started',    icon: AlertTriangle,  tone: 'muted' },
    pending:     { label: 'Under review',   icon: Clock,          tone: 'warning' },
    approved:    { label: 'Verified',        icon: CheckCircle2,   tone: 'success' },
    rejected:    { label: 'Rejected',        icon: XCircle,        tone: 'destructive' },
  };
  const s = map[status] ?? map.not_started;
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} className="gap-1.5 px-3 py-1 text-sm font-semibold">
      <Icon className="h-3.5 w-3.5" />
      {s.label}
    </Badge>
  );
}

// ── Detail pair ───────────────────────────────────────────────────────────────

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value || '—'}</dd>
    </div>
  );
}

// ── Reason label ──────────────────────────────────────────────────────────────

function reasonLabel(reason?: string): string {
  const map: Record<string, string> = {
    documents_unreadable: 'The document photo wasn\'t clear enough.',
    document_expired:     'The licence appears to be expired.',
    selfie_mismatch:      'The selfie didn\'t match the licence photo.',
    verification_failed:  'We couldn\'t confirm the details.',
  };
  return reason ? (map[reason] ?? 'We couldn\'t confirm the details.') : 'We couldn\'t confirm the details.';
}

// ── Manual upload ─────────────────────────────────────────────────────────────

const MANUAL_FIELDS = [
  { id: 'front',  label: "Driver's licence, front",  type: 'license' as const },
  { id: 'back',   label: "Driver's licence, back",   type: 'license' as const },
  { id: 'selfie', label: 'Selfie holding your licence', type: 'selfie' as const },
];

function ManualUpload({
  disabled,
  onSubmitted,
}: {
  disabled: boolean;
  onSubmitted: () => void;
}) {
  const toast = useToast();
  const [shots, setShots] = useState<Record<string, { blob: Blob; previewUrl: string } | undefined>>({});
  const [capturing, setCapturing] = useState<(typeof MANUAL_FIELDS)[number] | null>(null);
  const complete = MANUAL_FIELDS.every((f) => shots[f.id]);

  const submit = useMutation({
    mutationFn: async () => {
      const uploaded = await Promise.all(
        MANUAL_FIELDS.map((f) =>
          uploadFiles('kyc', [new File([shots[f.id]!.blob], `${f.id}.jpg`, { type: 'image/jpeg' })]),
        ),
      );
      return kycApi.submitDocuments(
        MANUAL_FIELDS.map((f, i) => ({ type: f.type, key: uploaded[i][0].key })),
      );
    },
    onSuccess: onSubmitted,
    onError: (e) =>
      toast({ title: e instanceof ApiError ? e.message : (e as Error).message, tone: 'error' }),
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="px-6 py-5">
        <p className="font-semibold text-foreground">Verify with your camera instead</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Take each photo live — no gallery uploads. Each shot is date/time stamped and reviewed
          by our team, usually within a few hours.
        </p>
      </div>

      <div className="border-t border-border px-6 py-4 space-y-3">
        {MANUAL_FIELDS.map((f) => {
          const shot = shots[f.id];
          return (
            <div key={f.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              {shot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shot.previewUrl}
                  alt={f.label}
                  className="h-14 w-20 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="grid h-14 w-20 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Camera className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{f.label}</p>
                <p className="text-xs text-muted-foreground">{shot ? 'Photo taken ✓' : 'Not taken yet'}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || submit.isPending}
                onClick={() => setCapturing(f)}
                className="shrink-0"
              >
                {shot ? 'Retake' : 'Take'}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border px-6 py-4">
        <Button
          className="w-full rounded-full font-bold"
          loading={submit.isPending}
          disabled={!complete || disabled}
          onClick={() => submit.mutate()}
        >
          Submit for review
        </Button>
      </div>

      {capturing && (
        <LiveCamera
          stamp={{ headline: 'CatoDrive identity check', detail: capturing.label }}
          requireLocation={false}
          facing={capturing.id === 'selfie' ? 'user' : 'environment'}
          onUse={async (shot) => {
            const previewUrl = URL.createObjectURL(shot.blob);
            setShots((p) => {
              if (p[capturing.id]) URL.revokeObjectURL(p[capturing.id]!.previewUrl);
              return { ...p, [capturing.id]: { blob: shot.blob, previewUrl } };
            });
            setCapturing(null);
          }}
          onClose={() => setCapturing(null)}
        />
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function VerifyIdentity() {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => accountApi.me(),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const status = useQuery({
    queryKey: ['kyc-status'],
    queryFn: () => kycApi.status(),
    refetchInterval: (q) =>
      (q.state.data as KycStatusView | undefined)?.status === 'pending' ? 5000 : false,
  });

  const [confirmed, setConfirmed] = useState(false);
  const [devSession, setDevSession] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const { key: stripeKey, ready: keyReady } = useStripePublishableKey();
  const manualAvailable = captureFailed || (keyReady && !stripeKey);

  const refreshStatus = () => qc.invalidateQueries({ queryKey: ['kyc-status'] });

  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) setReturnTo(next);
  }, []);
  useEffect(() => {
    if (returnTo && status.data?.status === 'approved') router.replace(returnTo);
  }, [returnTo, status.data?.status, router]);

  const start = useMutation({
    mutationFn: async () => {
      const session = await kycApi.startVerification();
      if (session.clientSecret && stripeKey) {
        const outcome = await openIdentityModal(session.clientSecret);
        return { outcome } as const;
      }
      if (session.url && session.url !== 'about:blank') {
        window.location.assign(session.url);
        return { outcome: 'redirect' } as const;
      }
      return { outcome: 'stub' } as const;
    },
    onSuccess: (r) => {
      if (r.outcome === 'completed') {
        refreshStatus();
        toast({ title: 'Submitted for review', tone: 'success' });
      } else if (r.outcome === 'stub') {
        if (isDev) setDevSession(true);
        else setCaptureFailed(true);
      } else if (r.outcome === 'canceled') {
        toast({ title: 'Verification cancelled', tone: 'info' });
      }
    },
    onError: (e) => {
      setCaptureFailed(true);
      toast({ title: e instanceof ApiError ? e.message : (e as Error).message, tone: 'error' });
    },
  });

  const decide = useMutation({
    mutationFn: (d: 'verified' | 'rejected') =>
      kycApi.devDecide(d, d === 'rejected' ? 'documents_unreadable' : undefined),
    onSuccess: () => { setDevSession(false); refreshStatus(); },
  });

  if (status.isLoading || me.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-52 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  const s = status.data?.status ?? 'not_started';
  const profile = me.data;
  const nameKnown = !!(profile?.firstName && profile?.lastName);
  const primaryAddress = profile?.addresses?.find((a: { isDefault?: boolean }) => a.isDefault) ?? profile?.addresses?.[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-0">

      {/* Back + header */}
      <div>
        <Link
          href="/account"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to account
        </Link>
        <h1 className="display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Identity verification
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every driver is verified against a government-issued ID before their first booking.
        </p>
      </div>

      {/* ── Approved ── */}
      {s === 'approved' && (
        <div className="overflow-hidden rounded-2xl border border-success/30 bg-card shadow-sm">
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <div>
              <p className="text-xl font-bold text-foreground">You're verified</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Your identity is confirmed. You're all set to book any vehicle on the platform.
              </p>
            </div>
            {returnTo ? (
              <Button onClick={() => router.push(returnTo)} className="mt-1 rounded-full px-6 font-bold">
                Back to your car
              </Button>
            ) : (
              <Button onClick={() => router.push('/search')} className="mt-1 rounded-full px-6 font-bold">
                Find a car
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Pending ── */}
      {s === 'pending' && (
        <div className="overflow-hidden rounded-2xl border border-amber-500/20 bg-card shadow-sm">
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
              <Clock className="h-8 w-8" />
            </span>
            <div>
              <p className="text-xl font-bold text-foreground">Under review</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                We've got your documents and are reviewing them now. Most checks finish in a few
                minutes — we'll notify you the moment it's done.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={refreshStatus}
              className="mt-1 gap-2 rounded-full font-semibold"
            >
              <RefreshCw className="h-4 w-4" /> Check status
            </Button>
          </div>
        </div>
      )}

      {/* ── Not started / Rejected ── */}
      {(s === 'not_started' || s === 'rejected') && (
        <>
          {/* Rejection notice */}
          {s === 'rejected' && (
            <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Last check didn't pass</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {reasonLabel(status.data?.reason)} Try again with a clear, well-lit photo of a valid licence.
                </p>
              </div>
            </div>
          )}

          {/* Status + current state */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Verification status</p>
            </div>
            <StatusPill status={s} />
          </div>

          {/* What you'll do */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="px-6 py-5">
              <p className="font-semibold text-foreground">What you'll do</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The whole process takes about 2 minutes.
              </p>
            </div>
            <div className="border-t border-border px-6 py-4 space-y-4">
              {STEPS.map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <step.icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm details */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="px-6 py-5">
              <p className="font-semibold text-foreground">Confirm your details</p>
              <p className="mt-1 text-sm text-muted-foreground">
                These must match the licence you're about to scan.
              </p>
            </div>
            <div className="border-t border-border px-6 py-4">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail
                  label="Legal name"
                  value={nameKnown ? `${profile!.firstName} ${profile!.lastName}` : ''}
                />
                <Detail
                  label="Date of birth"
                  value={profile?.dateOfBirth ? formatDate(profile.dateOfBirth) : ''}
                />
                <Detail
                  label="Address"
                  full
                  value={
                    primaryAddress
                      ? [
                          primaryAddress.line1,
                          primaryAddress.line2,
                          primaryAddress.city,
                          [primaryAddress.state, primaryAddress.zip].filter(Boolean).join(' '),
                        ]
                          .filter(Boolean)
                          .join(', ')
                      : ''
                  }
                />
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Something wrong?{' '}
                <Link href="/account/setup" className="font-medium text-primary underline">
                  Update on your profile
                </Link>{' '}
                then come back.
              </p>
            </div>

            {(!nameKnown || !profile?.dateOfBirth) && (
              <div className="border-t border-amber-500/20 bg-amber-500/5 px-6 py-4">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Please add your legal name and date of birth to your{' '}
                  <Link href="/account/setup" className="font-medium underline">
                    profile
                  </Link>{' '}
                  before verifying.
                </p>
              </div>
            )}

            <div className={cn('border-t border-border px-6 py-4', (!nameKnown || !profile?.dateOfBirth) && 'opacity-60 pointer-events-none')}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={!nameKnown || !profile?.dateOfBirth}
                  className="mt-0.5 accent-[hsl(var(--primary))]"
                />
                <span className="text-foreground">
                  The details above match my government-issued ID, and I'm ready to scan it.
                </span>
              </label>
            </div>

            <div className="border-t border-border px-6 py-4 space-y-3">
              {keyReady && !stripeKey && !isDev && (
                <p className="text-sm text-muted-foreground">
                  Instant verification is unavailable right now. Use the camera option below.
                </p>
              )}

              <Button
                className="w-full rounded-full font-bold"
                size="lg"
                loading={start.isPending || !keyReady}
                disabled={
                  !confirmed ||
                  !nameKnown ||
                  !profile?.dateOfBirth ||
                  (keyReady && !stripeKey && !isDev)
                }
                onClick={() => start.mutate()}
              >
                <Camera className="h-4 w-4" />
                {s === 'rejected' ? 'Try again' : 'Start verification'}
              </Button>

              {/* Dev offline simulator */}
              {isDev && devSession && (
                <div className="rounded-xl border border-dashed border-border p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Dev: simulate a decision
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={decide.isPending}
                      onClick={() => decide.mutate('verified')}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={decide.isPending}
                      onClick={() => decide.mutate('rejected')}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {manualAvailable && (
            <ManualUpload
              disabled={!nameKnown || !profile?.dateOfBirth}
              onSubmitted={() => {
                refreshStatus();
                toast({ title: 'Submitted for review', tone: 'success' });
              }}
            />
          )}
        </>
      )}

      {/* Footer */}
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Badge tone="muted" className="gap-1">
          <LockKeyhole className="h-3 w-3" /> Encrypted
        </Badge>
        Powered by Stripe Identity
      </p>

    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <VerifyIdentity />
    </AuthGuard>
  );
}
