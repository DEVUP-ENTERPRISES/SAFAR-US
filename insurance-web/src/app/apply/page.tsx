'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileCheck2, ShieldCheck, Upload, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/features/auth/store';
import { uploadFiles } from '@/features/media/upload';
import { DOC_ACCEPT } from '@/lib/upload-formats';
import { US_STATES } from '@/lib/data/us-states';
import { ApiError } from '@/lib/api/types';
import { INSURER_STATUS, insurerApi, type InsurerApplicationInput } from '@/features/insurers/api';
import { ErrorState } from '@/components/ui/states';

const STEPS = [
  { icon: FileCheck2, title: 'Your company', body: 'Tell us who you are and where you are licensed, and upload your licence.' },
  { icon: ShieldCheck, title: 'Your plans', body: 'Set your own prices, deductibles, limits and where each plan applies. CatoDrive reviews each plan before guests see it.' },
  { icon: Wallet, title: 'Get paid', body: 'Guests buy your plans at checkout. Your premiums, less CatoDrive’s commission, build up in your own account and are paid out to your bank.' },
];

const BLANK: InsurerApplicationInput = { legalName: '', displayName: '', licenceNumber: '', licensedStates: [], contactName: '', email: '', phone: '', website: '' };

/** A company sends its details here; CatoDrive approves the company and each plan before guests see anything. */
export default function ApplyPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const signedIn = status === 'authenticated';
  const qc = useQueryClient();
  const toast = useToast();
  const me = useQuery({ queryKey: ['insurer-me'], queryFn: () => insurerApi.me(), enabled: signedIn });
  const [form, setForm] = useState<InsurerApplicationInput>(BLANK);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof InsurerApplicationInput>(k: K, v: InsurerApplicationInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const apply = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      insurerApi.apply({ ...form, phone: form.phone?.trim() || undefined, website: form.website?.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['insurer-me'] });
      toast({ tone: 'success', title: 'Details sent', description: 'Set up your plans while we review your company.' });
      router.push('/portal');
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not send the application' }),
  });

  const uploadLicence = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const [up] = await uploadFiles('insurance', [file]);
      set('licenceDoc', { url: up.url, key: up.key });
    } catch (e) {
      toast({ tone: 'error', title: e instanceof Error ? e.message : 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const insurer = me.data?.insurer;
  const canApply = !insurer || insurer.status === 'rejected';
  const valid = form.legalName.trim().length >= 2 && form.displayName.trim().length >= 2 && form.licenceNumber.trim().length >= 2 && form.licensedStates.length > 0 && form.contactName.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 space-y-10 py-10">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Insurance partners</p>
        <h1 className="display text-3xl leading-tight sm:text-4xl">Sell your protection plans to CatoDrive guests</h1>
        <p className="max-w-2xl text-muted-foreground">
          Licensed insurers offer their own plans at checkout, with their own prices and terms, and run everything from their own portal.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <Card key={s.title}>
            <CardContent className="space-y-2 p-5">
              <s.icon className="h-6 w-6 text-primary" />
              <p className="font-semibold">{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {!signedIn ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">Create an account for your company to get started.</p>
            <Link href="/sign-up">
              <Button>Create an account <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </CardContent>
        </Card>
      ) : me.isError && !me.data ? (
          <ErrorState message="We couldn’t load your application." retry={() => void me.refetch()} />
        ) : me.isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : insurer && !canApply ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold">{insurer.displayName}</p>
              <Badge tone={INSURER_STATUS[insurer.status].tone}>{INSURER_STATUS[insurer.status].label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {insurer.status === 'pending'
                ? 'We’re reviewing your company and will email you. You can set up your plans now.'
                : insurer.status === 'suspended'
                  ? `Your plans are paused${insurer.suspendedReason ? `: ${insurer.suspendedReason}` : '.'} Contact us to reinstate them.`
                  : 'You are approved. Manage your plans and payouts in your portal.'}
            </p>
            <Link href="/portal" className="inline-block">
              <Button>Open your portal <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your company details</CardTitle>
            {insurer?.status === 'rejected' && (
              <p className="text-sm text-destructive">Your last application wasn’t approved{insurer.reviewNotes ? `: ${insurer.reviewNotes}` : '.'} You can correct it and apply again.</p>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Registered company name"><Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
              <Field label="Name guests see" hint="Shown next to your plans at checkout"><Input value={form.displayName} onChange={(e) => set('displayName', e.target.value)} /></Field>
              <Field label="Licence or NAIC number"><Input value={form.licenceNumber} onChange={(e) => set('licenceNumber', e.target.value)} /></Field>
              <Field label="Contact name"><Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
              <Field label="Contact email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Phone" hint="Optional"><Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Website" hint="Optional, with https://"><Input type="url" value={form.website} onChange={(e) => set('website', e.target.value)} /></Field>
            </div>
            <Field label="States you are licensed in" hint="Your plans can only be sold for cars in these states.">
              <div className="flex flex-wrap gap-1.5">
                {US_STATES.map((st) => (
                  <Chip key={st} active={form.licensedStates.includes(st)} onClick={() => set('licensedStates', form.licensedStates.includes(st) ? form.licensedStates.filter((x) => x !== st) : [...form.licensedStates, st])}>
                    {st}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Licence certificate" hint="PDF or photo. Kept private; only CatoDrive staff see it.">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-primary/40">
                <input type="file" accept={DOC_ACCEPT} className="hidden" disabled={uploading} onChange={(e) => { void uploadLicence(e.target.files?.[0]); e.target.value = ''; }} />
                <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : form.licenceDoc ? 'Replace file' : 'Upload'}
              </label>
              {form.licenceDoc && <p className="mt-1 text-xs text-success">Uploaded</p>}
            </Field>
            <Button size="lg" className="w-full sm:w-auto" disabled={!valid || uploading} loading={apply.isPending} onClick={() => apply.mutate()}>
              Send for review
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
