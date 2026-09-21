'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatDate } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';
import { ApiError } from '@/lib/api/types';

/**
 * Asset Partner programme members.
 *
 * Deliberately not a filter on the hosts list: a partner has a lifecycle
 * (onboarding → active → suspended → exited) and negotiated commercial terms
 * that no host has, and ops acts on both.
 */

const STATUSES = ['', 'onboarding', 'active', 'suspended', 'exited'];

const TONE: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  onboarding: 'warning',
  active: 'success',
  suspended: 'destructive',
  exited: 'muted',
};

const BLANK = {
  fullName: '',
  email: '',
  phone: '',
  businessName: '',
  partnerType: 'individual' as 'individual' | 'business' | 'fleet',
};

export default function AdminAssetPartnersPage() {
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-asset-partners', status],
    queryFn: () => adminApi.assetPartners({ status: status || undefined }),
  });

  const add = useMutation({
    mutationFn: () =>
      adminApi.addAssetPartner({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        businessName: form.businessName.trim() || undefined,
        partnerType: form.partnerType,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-asset-partners'] });
      setForm(BLANK);
      setAdding(false);
      // Re-entering someone is an ordinary mistake with 20 to key in — say so
      // plainly rather than reporting it as a new enrolment.
      toast({
        tone: res.alreadyExisted ? 'info' : 'success',
        title: res.alreadyExisted
          ? `${res.partner.displayName} was already a partner`
          : `${res.partner.displayName} added`,
        description: res.alreadyExisted
          ? 'No duplicate was created.'
          : res.accountCreated
            ? 'Account created and a sign-in email sent.'
            : 'Linked to their existing CatoDrive account.',
      });
    },
    onError: (e) =>
      toast({
        tone: 'error',
        title: e instanceof ApiError ? e.message : 'Could not add that partner',
      }),
  });

  const canSubmit = form.fullName.trim().length > 1 && /.+@.+\..+/.test(form.email.trim());

  const columns: Column<any>[] = [
    {
      header: 'Partner',
      cell: (p) => (
        <Link href={adminPath(`partners/${p._id}`)} className="font-medium hover:underline">
          {p.displayName}
        </Link>
      ),
    },
    { header: 'Type', cell: (p) => <span className="capitalize text-xs">{p.partnerType}</span> },
    { header: 'Status', cell: (p) => <Badge tone={TONE[p.status] ?? 'muted'}>{p.status}</Badge> },
    {
      header: 'Terms',
      cell: (p) =>
        // Only flag the exceptions — everyone else is on platform defaults, and
        // saying so on every row would bury the ones that are negotiated.
        p.terms && Object.values(p.terms).some((v) => v !== undefined && v !== null) ? (
          <Badge tone="warning">Negotiated</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Standard</span>
        ),
    },
    {
      header: 'Approved',
      cell: (p) => (
        <span className="text-xs">{p.approvedAt ? formatDate(p.approvedAt) : '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Asset Partners"
        title="Partners"
        description="Programme members — managed vehicle owners paid a monthly net after the management fee, fleet insurance and detailing."
        actions={
          <Button onClick={() => setAdding((a) => !a)} variant={adding ? 'outline' : 'primary'}>
            {adding ? 'Cancel' : (<><Plus className="h-4 w-4" /> Add partner</>)}
          </Button>
        }
      />

      {/*
        Direct entry, for owners who never applied — the fleet that predates
        the website. Only what ops actually knows is asked for: filling in a
        prospect questionnaire on someone's behalf would invent answers nobody
        gave. Payout details and documents are the partner's own to add from
        their portal once they sign in.
      */}
      {adding && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" /> Add an existing partner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" hint="The owner's own name, as on the agreement.">
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Jordan Ellis"
                  autoFocus
                />
              </Field>
              <Field label="Email" hint="Their sign-in address — the code goes here.">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jordan@example.com"
                />
              </Field>
              <Field label="Phone" hint="Optional.">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 469 555 0134"
                />
              </Field>
              <Field label="Partner type">
                <Select
                  value={form.partnerType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, partnerType: e.target.value as typeof f.partnerType }))
                  }
                >
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                  <option value="fleet">Fleet</option>
                </Select>
              </Field>
              {form.partnerType !== 'individual' && (
                <Field label="Business name" hint="Shown instead of their own name.">
                  <Input
                    value={form.businessName}
                    onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                    placeholder="Ellis Mobility LLC"
                  />
                </Field>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              They start in <span className="font-medium text-foreground">onboarding</span> on
              standard platform terms, and are emailed a sign-in link. No password is set for
              them — they sign in with a code and add their own payout details. Negotiated terms,
              if any, go on their record afterwards.
            </p>

            <div className="flex justify-end">
              <Button disabled={!canSubmit} loading={add.isPending} onClick={() => add.mutate()}>
                Add partner
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="hide-scrollbar flex gap-2 overflow-x-auto">
        {STATUSES.map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">
            {s || 'All'}
          </Chip>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={data}
        isLoading={isLoading}
        emptyTitle="No Asset Partners yet"
        emptyDescription="Partners join by applying, or add an owner you already have an agreement with using Add partner."
      />
    </div>
  );
}
