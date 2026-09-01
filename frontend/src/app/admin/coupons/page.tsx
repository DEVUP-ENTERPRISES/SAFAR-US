'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Select } from '@/components/ui/select';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatDate } from '@/lib/utils/format';
import { adminApi, type Coupon } from '@/features/admin/api';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function AdminCouponsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({
    code: '',
    campaign: '',
    type: 'percent' as 'percent' | 'fixed',
    value: '10',
    maxDiscount: '15',
    budget: '',
    maxRedemptions: '500',
    perUserLimit: '1',
    firstTimeOnly: false,
    validTo: '',
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-coupons'] });
  const { data, isLoading } = useQuery({
    queryKey: ['admin-coupons', status],
    queryFn: () => adminApi.coupons({ status: status || undefined }),
  });

  const create = useMutation({
    mutationFn: () =>
      adminApi.createCoupon({
        code: draft.code.trim().toUpperCase(),
        campaign: draft.campaign || undefined,
        type: draft.type,
        // Percent is entered as a percentage and stored as basis points; fixed
        // is entered in dollars and stored in cents.
        ...(draft.type === 'percent'
          ? { valueBps: Math.round(Number(draft.value) * 100) }
          : { amount: Math.round(Number(draft.value) * 100) }),
        maxDiscount: draft.maxDiscount ? Math.round(Number(draft.maxDiscount) * 100) : 0,
        budget: draft.budget ? Math.round(Number(draft.budget) * 100) : 0,
        maxRedemptions: Number(draft.maxRedemptions) || 1000,
        perUserLimit: Number(draft.perUserLimit),
        firstTimeOnly: draft.firstTimeOnly,
        validTo: draft.validTo || new Date(Date.now() + 30 * 864e5).toISOString(),
      } as Partial<Coupon>),
    onSuccess: () => {
      setComposing(false);
      toast({ tone: 'success', title: 'Promo code created' });
      refresh();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof Error ? e.message : 'Could not create the code' }),
  });

  const setStatusM = useMutation({
    mutationFn: ({ id, s }: { id: string; s: 'active' | 'disabled' }) => adminApi.setCouponStatus(id, s),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => adminApi.deleteCoupon(id), onSuccess: refresh });

  const columns: Column<Coupon>[] = [
    {
      header: 'Code',
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-mono font-semibold">{c.code}</p>
          {c.campaign && <p className="truncate text-xs text-muted-foreground">{c.campaign}</p>}
        </div>
      ),
    },
    {
      header: 'Discount',
      cell: (c) => (
        <span>
          {c.type === 'percent' ? `${c.valueBps / 100}%` : money(c.amount)}
          {c.maxDiscount > 0 && c.type === 'percent' && (
            <span className="text-muted-foreground"> up to {money(c.maxDiscount)}</span>
          )}
        </span>
      ),
    },
    {
      header: 'Used',
      cell: (c) => (
        <span>
          {c.redeemedCount}/{c.maxRedemptions}
        </span>
      ),
    },
    {
      header: 'Budget',
      cell: (c) =>
        c.budget > 0 ? (
          <span className={c.spent >= c.budget ? 'text-destructive' : ''}>
            {money(c.spent)} / {money(c.budget)}
          </span>
        ) : (
          <span className="text-muted-foreground">unlimited</span>
        ),
    },
    {
      header: 'Rules',
      cell: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.perUserLimit > 0 ? `${c.perUserLimit}/user` : 'unlimited/user'}
          {c.firstTimeOnly ? ' · new guests' : ''}
        </span>
      ),
    },
    { header: 'Ends', cell: (c) => formatDate(c.validTo) },
    {
      header: 'Status',
      cell: (c) => <Badge tone={c.status === 'active' ? 'success' : 'muted'}>{c.status}</Badge>,
    },
    {
      header: '',
      cell: (c) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStatusM.mutate({ id: c._id, s: c.status === 'active' ? 'disabled' : 'active' })}
          >
            {c.status === 'active' ? 'Pause' : 'Resume'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const { ok } = await confirm({
                title: `Delete ${c.code}?`,
                description: 'Guests using this code at checkout will stop being able to apply it.',
                confirmLabel: 'Delete',
                tone: 'destructive',
              });
              if (ok) remove.mutate(c._id);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-display-sm">Promo codes</h1>
        <Button onClick={() => setComposing((v) => !v)}>{composing ? 'Cancel' : 'New code'}</Button>
      </div>

      {composing && (
        <Card>
          <CardContent className="grid gap-4 py-5 sm:grid-cols-2">
            <Field label="Code"><Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder="SUMMER25" /></Field>
            <Field label="Campaign (internal)"><Input value={draft.campaign} onChange={(e) => setDraft({ ...draft, campaign: e.target.value })} placeholder="Summer launch" /></Field>
            <Field label="Type">
              <Select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as 'percent' | 'fixed' })}
              >
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
              </Select>
            </Field>
            <Field label={draft.type === 'percent' ? 'Percent off' : 'Dollars off'}>
              <Input type="number" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
            </Field>
            {draft.type === 'percent' && (
              <Field label="Max discount ($) — caps one redemption">
                <Input type="number" value={draft.maxDiscount} onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })} />
              </Field>
            )}
            <Field label="Campaign budget ($) — 0 = unlimited">
              <Input type="number" value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Max redemptions"><Input type="number" value={draft.maxRedemptions} onChange={(e) => setDraft({ ...draft, maxRedemptions: e.target.value })} /></Field>
            <Field label="Per-guest limit"><Input type="number" value={draft.perUserLimit} onChange={(e) => setDraft({ ...draft, perUserLimit: e.target.value })} /></Field>
            <Field label="Ends on"><Input type="date" value={draft.validTo} onChange={(e) => setDraft({ ...draft, validTo: e.target.value })} /></Field>
            <label className="flex cursor-pointer items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={draft.firstTimeOnly}
                onChange={(e) => setDraft({ ...draft, firstTimeOnly: e.target.checked })}
                className="accent-[hsl(var(--primary))]"
              />
              First-time guests only
            </label>
            <div className="sm:col-span-2">
              <Button loading={create.isPending} disabled={draft.code.trim().length < 3} onClick={() => create.mutate()}>
                Create code
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {[
          { v: '', l: 'All' },
          { v: 'active', l: 'Active' },
          { v: 'disabled', l: 'Paused' },
        ].map((f) => (
          <Chip key={f.v} active={status === f.v} onClick={() => setStatus(f.v)}>{f.l}</Chip>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        isLoading={isLoading}
        emptyTitle="No promo codes yet"
        emptyDescription="Create one to run a campaign — budgets and per-guest limits are enforced automatically."
      />
    </div>
  );
}
