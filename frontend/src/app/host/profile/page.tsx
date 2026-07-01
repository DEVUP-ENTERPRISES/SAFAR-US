'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { useHostMe, useUpdateHostProfile } from '@/features/host/hooks';

export default function HostProfilePage() {
  const { data, isLoading } = useHostMe();
  const update = useUpdateHostProfile();

  const [form, setForm] = useState({
    displayName: '',
    bio: '',
    hostType: 'individual' as 'individual' | 'business',
    legalName: '',
    registrationNumber: '',
    taxId: '',
    accountHolder: '',
    bankName: '',
    ifscOrRouting: '',
    accountNumberMasked: '',
  });

  useEffect(() => {
    if (data) {
      setForm((f) => ({
        ...f,
        displayName: data.displayName ?? '',
        bio: data.bio ?? '',
        hostType: data.hostType ?? 'individual',
        legalName: (data.businessProfile?.legalName as string) ?? '',
        registrationNumber: (data.businessProfile?.registrationNumber as string) ?? '',
        taxId: (data.taxInfo?.taxId as string) ?? '',
        accountHolder: (data.bankingDetails?.accountHolder as string) ?? '',
        bankName: (data.bankingDetails?.bankName as string) ?? '',
        ifscOrRouting: (data.bankingDetails?.ifscOrRouting as string) ?? '',
        accountNumberMasked: (data.bankingDetails?.accountNumberMasked as string) ?? '',
      }));
    }
  }, [data]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const save = () =>
    update.mutate({
      displayName: form.displayName,
      bio: form.bio,
      hostType: form.hostType,
      businessProfile: { legalName: form.legalName, registrationNumber: form.registrationNumber },
      taxInfo: { taxId: form.taxId },
      bankingDetails: {
        accountHolder: form.accountHolder,
        bankName: form.bankName,
        ifscOrRouting: form.ifscOrRouting,
        accountNumberMasked: form.accountNumberMasked,
      },
    });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Host profile</h1>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name"><Input value={form.displayName} onChange={f('displayName')} /></Field>
          <Field label="Host type">
            <select value={form.hostType} onChange={(e) => setForm({ ...form, hostType: e.target.value as 'individual' | 'business' })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="individual">Individual</option>
              <option value="business">Business</option>
            </select>
          </Field>
          <Field label="Bio" className="sm:col-span-2"><Input value={form.bio} onChange={f('bio')} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Business profile</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name"><Input value={form.legalName} onChange={f('legalName')} /></Field>
          <Field label="Registration number"><Input value={form.registrationNumber} onChange={f('registrationNumber')} /></Field>
          <Field label="Tax ID (GSTIN/PAN)" className="sm:col-span-2"><Input value={form.taxId} onChange={f('taxId')} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Banking details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Account holder"><Input value={form.accountHolder} onChange={f('accountHolder')} /></Field>
          <Field label="Bank name"><Input value={form.bankName} onChange={f('bankName')} /></Field>
          <Field label="IFSC / Routing"><Input value={form.ifscOrRouting} onChange={f('ifscOrRouting')} /></Field>
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
