'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { useHostMe, useUpdateHostProfile } from '~/features/host/hooks';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EMPTY_HOST_PROFILE, hostProfileForm, hostProfilePatch, type HostProfileForm } from '~/features/host/profile-form';

export default function HostProfilePage() {
  const { data, isLoading } = useHostMe();
  const update = useUpdateHostProfile();

  const [form, setForm] = useState<HostProfileForm>(EMPTY_HOST_PROFILE);

  useEffect(() => {
    if (data) setForm(hostProfileForm(data));
  }, [data]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const save = () => update.mutate(hostProfilePatch(form));

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="display text-display-sm">CatoDrive profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Public profile</CardTitle>
          <p className="text-sm text-muted-foreground">
            This is what guests see on your listings and on your profile page.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <AvatarUpload
            url={form.avatarUrl || null}
            name={form.displayName}
            onChange={(next) =>
              setForm((prev) => ({
                ...prev,
                avatarUrl: next?.url ?? '',
                avatarKey: next?.key ?? '',
              }))
            }
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Display name"><Input value={form.displayName} onChange={f('displayName')} /></Field>
            <Field label="Account type">
              <Select value={form.hostType} onChange={(e) => setForm({ ...form, hostType: e.target.value as 'individual' | 'business' })}>
                <option value="individual">Individual</option>
                <option value="business">Business</option>
              </Select>
            </Field>
            <Field label="Lives in" hint="City guests will see, e.g. Brooklyn, NY">
              <Input value={form.city} onChange={f('city')} placeholder="Brooklyn, NY" />
            </Field>
            <Field label="Work" hint="Optional">
              <Input value={form.work} onChange={f('work')} placeholder="Photographer" />
            </Field>
            <Field label="Languages spoken" className="sm:col-span-2" hint="Comma separated">
              <Input value={form.languages} onChange={f('languages')} placeholder="English, Spanish" />
            </Field>
            <Field label="About you" className="sm:col-span-2" hint="A short intro guests see on CatoDrive Fleet cars">
              <Textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={4}
                maxLength={500}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Business profile</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Legal name"><Input value={form.legalName} onChange={f('legalName')} /></Field>
          <Field label="Registration number"><Input value={form.registrationNumber} onChange={f('registrationNumber')} /></Field>
          <Field label="Tax ID (EIN / SSN)" className="sm:col-span-2"><Input value={form.taxId} onChange={f('taxId')} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Banking details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Account holder"><Input value={form.accountHolder} onChange={f('accountHolder')} /></Field>
          <Field label="Bank name"><Input value={form.bankName} onChange={f('bankName')} /></Field>
          <Field label="Routing number"><Input value={form.ifscOrRouting} onChange={f('ifscOrRouting')} /></Field>
          <Field label="Account (last 4)" hint="Store only masked digits"><Input value={form.accountNumberMasked} onChange={f('accountNumberMasked')} /></Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button loading={update.isPending} onClick={save}>Save changes</Button>
        {update.isSuccess && <span className="text-sm text-success">Saved ✓</span>}
      </div>
    </div>
  );
}
