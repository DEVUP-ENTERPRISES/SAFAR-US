'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils/format';
import Link from 'next/link';
import { claimsApi } from '@/features/claims/api';

const TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> = {
  opened: 'warning', investigating: 'default', approved: 'success', settled: 'success', rejected: 'destructive', closed: 'muted',
};

function Claims() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'damage' as 'damage' | 'insurance' | 'dispute', description: '', bookingId: '' });
  const list = useQuery({ queryKey: ['my-claims'], queryFn: () => claimsApi.list() });
  const create = useMutation({
    mutationFn: () => claimsApi.create({ type: form.type, description: form.description, bookingId: form.bookingId || undefined }),
    onSuccess: () => { setOpen(false); setForm({ type: 'damage', description: '', bookingId: '' }); qc.invalidateQueries({ queryKey: ['my-claims'] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="display text-display-sm">Claims</h1>
        <Button onClick={() => setOpen((v) => !v)}><Plus className="h-4 w-4" /> File a claim</Button>
      </div>

      {open && (
        <Card>
          <CardHeader><CardTitle>New claim</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>
                <option value="damage">Damage</option>
                <option value="insurance">Insurance</option>
                <option value="dispute">Dispute</option>
              </Select>
            </Field>
            <Field label="Booking ID (optional)"><Input value={form.bookingId} onChange={(e) => setForm({ ...form, bookingId: e.target.value })} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></Field>
            <div className="sm:col-span-2"><Button disabled={form.description.length < 5} loading={create.isPending} onClick={() => create.mutate()}>Submit claim</Button></div>
          </CardContent>
        </Card>
      )}

      {list.isLoading && <Skeleton className="h-40 w-full" />}
      {list.data && list.data.length === 0 && <EmptyState title="No claims" description="Filed claims appear here with live status." />}
      {list.data && list.data.length > 0 && (
        <div className="space-y-3">
          {list.data.map((c) => (
            <Link key={c._id} href={`/claims/${c._id}`} className="block">
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between pt-6">
                  <div>
                    <p className="font-medium capitalize">{c.type} claim</p>
                    <p className="line-clamp-1 max-w-md text-sm text-muted-foreground">{c.description}</p>
                    <p className="text-xs text-muted-foreground">Filed {formatDate(c.createdAt)}</p>
                  </div>
                  <Badge tone={TONE[c.status] ?? 'muted'}>{c.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClaimsPage() {
  return <AuthGuard><Claims /></AuthGuard>;
}
