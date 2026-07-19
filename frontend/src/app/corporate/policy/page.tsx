'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { corporateApi } from '@/features/corporate/api';

export default function PolicyPage() {
  const qc = useQueryClient();
  const policy = useQuery({ queryKey: ['corp-policy'], queryFn: () => corporateApi.policy() });
  const [form, setForm] = useState({ maxDailyPrice: 0, allowedCategories: '', autoApproveUnder: 0, requireApprovalOver: 0 });

  useEffect(() => {
    if (policy.data) setForm({
      maxDailyPrice: policy.data.maxDailyPrice / 100,
      allowedCategories: policy.data.allowedCategories.join(', '),
      autoApproveUnder: policy.data.autoApproveUnder / 100,
      requireApprovalOver: policy.data.requireApprovalOver / 100,
    });
  }, [policy.data]);

  const save = useMutation({
    mutationFn: () => corporateApi.setPolicy({
      maxDailyPrice: Math.round(form.maxDailyPrice * 100),
      allowedCategories: form.allowedCategories.split(',').map((s) => s.trim()).filter(Boolean),
      autoApproveUnder: Math.round(form.autoApproveUnder * 100),
      requireApprovalOver: Math.round(form.requireApprovalOver * 100),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['corp-policy'] }),
  });

  if (policy.isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="display text-display-sm">Travel policy</h1>
      <Card>
        <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Max daily price ($, 0 = no cap)"><Input type="number" value={form.maxDailyPrice} onChange={(e) => setForm({ ...form, maxDailyPrice: Number(e.target.value) })} /></Field>
          <Field label="Allowed categories (comma, blank = all)" className="sm:col-span-2"><Input value={form.allowedCategories} onChange={(e) => setForm({ ...form, allowedCategories: e.target.value })} placeholder="economy, suv" /></Field>
          <Field label="Auto-approve under ($)" hint="Trips at/under this total auto-approve"><Input type="number" value={form.autoApproveUnder} onChange={(e) => setForm({ ...form, autoApproveUnder: Number(e.target.value) })} /></Field>
          <Field label="Always require approval over ($)"><Input type="number" value={form.requireApprovalOver} onChange={(e) => setForm({ ...form, requireApprovalOver: Number(e.target.value) })} /></Field>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button loading={save.isPending} onClick={() => save.mutate()}>Save policy</Button>
            {save.isSuccess && <span className="text-sm text-success">Saved ✓</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
