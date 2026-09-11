'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { accountApi, type OnboardingInput } from '@/features/account/api';
import { usePlatformConfig } from '@/features/platform/config';
import { useAuthStore } from '@/features/auth/store';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';

type Form = {
  firstName: string; lastName: string; dateOfBirth: string; phone: string;
  line1: string; city: string; state: string; zip: string; country: string;
  ecName: string; ecPhone: string; ecRelation: string;
};

const EMPTY: Form = {
  firstName: '', lastName: '', dateOfBirth: '', phone: '',
  line1: '', city: '', state: '', zip: '', country: 'US',
  ecName: '', ecPhone: '', ecRelation: '',
};

export default function AccountSetupPage() {
  const router = useRouter();
  const notify = useToast();
  const qc = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const cfg = usePlatformConfig();
  const minAge = cfg.data?.legal?.minAgeYears ?? 18;

  const [form, setForm] = useState<Form>(EMPTY);
  const [avatar, setAvatar] = useState<{ url: string; key: string } | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Not signed in → nothing to set up here.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?next=/account/setup');
  }, [status, router]);

  // Prefill anything we already have (name/phone from sign-up) so returning
  // guests don't retype it.
  const me = useQuery({ queryKey: ['me-prefill'], queryFn: () => accountApi.me(), enabled: status === 'authenticated' });
  useEffect(() => {
    if (!me.data) return;
    setForm((f) => ({
      ...f,
      firstName: f.firstName || me.data.firstName || '',
      lastName: f.lastName || me.data.lastName || '',
      phone: f.phone || me.data.phone || '',
      dateOfBirth: f.dateOfBirth || me.data.dateOfBirth || '',
    }));
    if (me.data.avatarUrl && !avatar) setAvatar({ url: me.data.avatarUrl, key: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data]);

  const submit = useMutation({
    meta: { silentError: true },
    mutationFn: () => {
      const dto: OnboardingInput = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth,
        phone: form.phone.trim(),
        avatarUrl: avatar!.url,
        address: {
          line1: form.line1.trim(), city: form.city.trim(), state: form.state.trim(),
          zip: form.zip.trim(), country: form.country.trim(),
        },
        emergencyContact: {
          name: form.ecName.trim(), phone: form.ecPhone.trim(),
          relation: form.ecRelation.trim() || undefined,
        },
      };
      return accountApi.completeOnboarding(dto);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['profile-status'] });
      notify({ tone: 'success', title: 'You’re all set', description: 'Your account is ready.' });
      router.replace('/');
    },
    onError: (err) => {
      notify({ tone: 'error', title: 'Couldn’t save', description: err instanceof ApiError ? err.message : 'Please check your details and try again.' });
    },
  });

  const filled =
    form.firstName && form.lastName && form.dateOfBirth && form.phone &&
    form.line1 && form.city && form.state && form.zip && form.country &&
    form.ecName && form.ecPhone && !!avatar?.url;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <ShieldCheck className="h-4 w-4" /> Account setup
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Finish setting up your account</h1>
        <p className="mt-2 text-muted-foreground">
          We need a few details before you can book — this is what a rental (and its insurer) requires.
          You must be at least {minAge}.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (filled) submit.mutate(); }}
        className="space-y-8"
      >
        {/* Photo */}
        <section className="flex items-center gap-5">
          <AvatarUpload url={avatar?.url} name={form.firstName} onChange={setAvatar} />
          <div>
            <p className="font-medium">Profile photo</p>
            <p className="text-sm text-muted-foreground">A clear photo of your face. Hosts see this at handover.</p>
          </div>
        </section>

        {/* Legal identity */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Legal identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal first name" htmlFor="firstName">
              <Input id="firstName" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" required />
            </Field>
            <Field label="Legal last name" htmlFor="lastName">
              <Input id="lastName" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" required />
            </Field>
            <Field label="Date of birth" htmlFor="dob">
              <Input id="dob" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} autoComplete="bday" required />
            </Field>
            <Field label="Mobile number" htmlFor="phone">
              <Input id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+1 555 000 0000" required />
            </Field>
          </div>
        </section>

        {/* Address */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Home address</h2>
          <Field label="Street address" htmlFor="line1">
            <Input id="line1" value={form.line1} onChange={set('line1')} autoComplete="address-line1" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="city">
              <Input id="city" value={form.city} onChange={set('city')} autoComplete="address-level2" required />
            </Field>
            <Field label="State / province" htmlFor="state">
              <Input id="state" value={form.state} onChange={set('state')} autoComplete="address-level1" required />
            </Field>
            <Field label="ZIP / postal code" htmlFor="zip">
              <Input id="zip" value={form.zip} onChange={set('zip')} autoComplete="postal-code" required />
            </Field>
            <Field label="Country" htmlFor="country">
              <Input id="country" value={form.country} onChange={set('country')} autoComplete="country-name" required />
            </Field>
          </div>
        </section>

        {/* Emergency contact */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Emergency contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="ecName">
              <Input id="ecName" value={form.ecName} onChange={set('ecName')} required />
            </Field>
            <Field label="Phone" htmlFor="ecPhone">
              <Input id="ecPhone" type="tel" value={form.ecPhone} onChange={set('ecPhone')} required />
            </Field>
            <Field label="Relationship (optional)" htmlFor="ecRelation">
              <Input id="ecRelation" value={form.ecRelation} onChange={set('ecRelation')} placeholder="Parent, partner, friend…" />
            </Field>
          </div>
        </section>

        <Button type="submit" size="lg" className="w-full" disabled={!filled} loading={submit.isPending}>
          Complete setup
        </Button>
      </form>
    </div>
  );
}
