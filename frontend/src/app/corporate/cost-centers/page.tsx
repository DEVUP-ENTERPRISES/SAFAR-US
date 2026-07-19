'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/utils/format';
import { corporateApi } from '@/features/corporate/api';

export default function CostCentersPage() {
  const qc = useQueryClient();
  const centers = useQuery({ queryKey: ['corp-cc'], queryFn: () => corporateApi.costCenters() });
  const [form, setForm] = useState({ name: '', code: '', budget: 0 });
  const create = useMutation({
    mutationFn: () => corporateApi.createCostCenter(form.name, form.code, Math.round(form.budget * 100)),
    onSuccess: () => { setForm({ name: '', code: '', budget: 0 }); qc.invalidateQueries({ queryKey: ['corp-cc'] }); },
  });

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Cost centers</h1>
      <Card>
        <CardHeader><CardTitle>New cost center</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sales team" /></Field>
          <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SALES" /></Field>
          <Field label="Budget ($)"><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} /></Field>
          <Button disabled={!form.name || !form.code} loading={create.isPending} onClick={() => create.mutate()}>Create</Button>
        </CardContent>
      </Card>

      {centers.isLoading && <Skeleton className="h-40 w-full" />}
      {centers.data && centers.data.length === 0 && <EmptyState title="No cost centers yet" description="Create budget buckets to track team spend." />}
      {centers.data && centers.data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {centers.data.map((c) => (
            <Card key={c._id}>
              <CardContent className="pt-6">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.code}</p>
                <p className="mt-2 text-lg font-bold">{formatMoney({ amount: c.budget, currency: c.currency })}<span className="text-sm font-normal text-muted-foreground"> budget</span></p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
