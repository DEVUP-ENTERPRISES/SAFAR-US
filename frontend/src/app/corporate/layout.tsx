'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { corporateApi } from '@/features/corporate/api';
import { CorporateSidebar } from '@/features/corporate/components/corporate-sidebar';

function CorporateShell({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['corp-me'], queryFn: () => corporateApi.me(), retry: false });
  const [form, setForm] = useState({ name: '', billingEmail: '', domain: '' });
  const create = useMutation({
    mutationFn: () => corporateApi.createOrg(form.name, form.billingEmail, form.domain || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['corp-me'] }),
  });

  if (me.isLoading) return <Skeleton className="h-72 w-full" />;

  // No org yet → onboarding.
  if (!me.data) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Set up your organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Create your company workspace to manage employees, budgets, policies and invoices.</p>
          <Field label="Company name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Billing email"><Input type="email" value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} /></Field>
          <Field label="Email domain (optional)" hint="e.g. acme.com"><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></Field>
          <Button className="w-full" disabled={!form.name || !form.billingEmail} loading={create.isPending} onClick={() => create.mutate()}>Create organization</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex gap-8">
      <CorporateSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function CorporateLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/corporate/login') return <>{children}</>;
  return (
    <AuthGuard loginPath="/corporate/login">
      <CorporateShell>{children}</CorporateShell>
    </AuthGuard>
  );
}
