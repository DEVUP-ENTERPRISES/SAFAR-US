'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { deskApi } from '@/features/insurance-desk/api';
import { INSURER_STATUS, type Insurer } from '@/features/insurers/api';
import { formatDate } from '@/lib/utils/format';
import { ApiError } from '@/lib/api/types';

const STATUSES = ['', 'pending', 'approved', 'suspended', 'rejected'];

/** Insurance partners: approve applications, and set the commission CatoDrive keeps on premiums by default. */
export default function InsurersPage() {
  const [status, setStatus] = useState('pending');
  const list = useQuery({ queryKey: ['admin-insurers', status], queryFn: () => deskApi.insurers({ status: status || undefined }) });

  const columns: Column<Insurer>[] = [
    {
      header: 'Insurer',
      cell: (i) => (
        <div>
          <p className="font-medium">{i.displayName}</p>
          <p className="text-xs text-muted-foreground">{i.legalName}</p>
        </div>
      ),
    },
    { header: 'Licence', cell: (i) => <span className="font-mono text-xs">{i.licenceNumber}</span> },
    { header: 'States', cell: (i) => <span className="text-xs">{i.licensedStates.join(', ')}</span> },
    { header: 'Applied', cell: (i) => <span className="text-xs">{formatDate(i.createdAt)}</span> },
    { header: 'Status', cell: (i) => <Badge tone={INSURER_STATUS[i.status].tone}>{INSURER_STATUS[i.status].label}</Badge> },
    {
      header: 'Actions',
      className: 'text-end',
      cell: (i) => (
        <Link href={`/insurers/${i._id}`}>
          <span className="text-sm font-medium text-primary hover:underline">Open →</span>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Supply · Insurance"
        title="Insurance partners"
        description="Insurers apply on catodrive.com/insurers and run their own plans and payouts. You approve them, suspend them, and record what has been paid to them."
      />
      <DefaultCommission />
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)}>
            {s ? INSURER_STATUS[s as Insurer['status']].label : 'All'}
          </Chip>
        ))}
      </div>
      <DataTable columns={columns} rows={list.data} isLoading={list.isLoading} emptyTitle="No insurers" emptyDescription="Applications from insurers appear here." />
    </div>
  );
}

function DefaultCommission() {
  const qc = useQueryClient();
  const toast = useToast();
  const cfg = useQuery({ queryKey: ['insurance-settings'], queryFn: () => deskApi.settings() });
  const [pct, setPct] = useState('');
  useEffect(() => {
    const bps = cfg.data?.partnerCommissionBps;
    if (typeof bps === 'number') setPct(String(bps / 100));
  }, [cfg.data]);
  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () => deskApi.saveSettings({ partnerCommissionBps: Math.round(Number(pct) * 100), reason: 'Insurance partner commission' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['insurance-settings'] });
      toast({ tone: 'success', title: 'Default commission saved' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' }),
  });
  const n = Number(pct);
  return (
    <Card>
      <CardHeader><CardTitle>Default commission on premiums</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="CatoDrive keeps (%)" hint="Of each insurer premium, unless an insurer has its own rate. Applies to bookings made after saving.">
          <Input type="number" min={0} max={50} step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} className="w-32" />
        </Field>
        <Button loading={save.isPending} disabled={pct === '' || !(n >= 0 && n <= 50)} onClick={() => save.mutate()}>Save</Button>
      </CardContent>
    </Card>
  );
}
