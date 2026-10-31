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
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils/format';
import Link from 'next/link';
import { claimsApi } from '@/features/claims/api';
import { claimableTrips, tripLabel } from '@/features/claims/claim-trips';
import { useMyBookings } from '@/features/bookings/queries';
import { uploadFiles } from '@/features/media/upload';
import { ApiError } from '@/lib/api/types';
import { CLAIM_LIST_TONE } from '@/features/claims/status';


function Claims() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const blank = { type: 'damage' as 'damage' | 'insurance' | 'dispute', description: '', bookingId: '', amount: '' };
  const [form, setForm] = useState(blank);
  const [files, setFiles] = useState<{ url: string; key: string; kind: 'image' | 'file'; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const list = useQuery({ queryKey: ['my-claims'], queryFn: () => claimsApi.list() });
  const trips = useMyBookings('guest');
  const options = claimableTrips(trips.data);
  const create = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      claimsApi.create({
        type: form.type,
        description: form.description.trim(),
        bookingId: form.bookingId,
        amountClaimed: form.amount ? Math.round(Number(form.amount) * 100) : undefined,
        evidence: files.map((f) => ({ url: f.url, kind: f.kind })),
      }),
    onSuccess: () => { setOpen(false); setForm(blank); setFiles([]); qc.invalidateQueries({ queryKey: ['my-claims'] }); },
  });
  const addFiles = async (list?: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    setUploadError(undefined);
    try {
      const picked = Array.from(list).slice(0, 10);
      const ups = await uploadFiles('claim', picked);
      setFiles((f) => [...f, ...ups.map((u, i) => ({ ...u, kind: picked[i].type === 'application/pdf' ? ('file' as const) : ('image' as const), name: picked[i].name }))].slice(0, 20));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'That didn’t upload. Try again.');
    } finally {
      setUploading(false);
    }
  };
  const needsPhoto = form.type === 'damage' && !files.some((f) => f.kind === 'image');

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
            <Field label="Which trip?" htmlFor="claim-trip" hint={trips.isError ? 'We couldn’t load your trips. Refresh to try again.' : options.length === 0 && !trips.isLoading ? 'You have no trips to claim about yet.' : undefined}>
              <Select id="claim-trip" value={form.bookingId} disabled={trips.isLoading} onChange={(e) => setForm({ ...form, bookingId: e.target.value })}>
                <option value="" disabled>{trips.isLoading ? 'Loading your trips…' : 'Choose a trip'}</option>
                {options.map((b) => <option key={b._id} value={b._id}>{tripLabel(b)}</option>)}
              </Select>
            </Field>
            <Field label="What happened" htmlFor="claim-desc" className="sm:col-span-2"><Textarea id="claim-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={2000} /></Field>
            <Field label="Amount you’re claiming (optional, USD)" htmlFor="claim-amount"><Input id="claim-amount" type="number" inputMode="decimal" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label={form.type === 'damage' ? 'Photos (at least one)' : 'Photos or papers (optional)'} htmlFor="claim-files" hint="JPG, PNG or PDF. Up to 20.">
              <input id="claim-files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading} onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} className="block w-full text-sm file:me-3 file:rounded-sm file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm" />
            </Field>
            {(files.length > 0 || uploading || uploadError) && (
              <div className="sm:col-span-2 text-sm">
                {uploading && <p className="text-muted-foreground">Uploading…</p>}
                {uploadError && <p role="alert" className="text-destructive">{uploadError}</p>}
                {files.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {files.map((f) => (
                      <li key={f.key} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                        {f.name}
                        <button type="button" aria-label={`Remove ${f.name}`} className="font-semibold" onClick={() => setFiles(files.filter((x) => x.key !== f.key))}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {create.isError && <p role="alert" className="sm:col-span-2 text-sm text-destructive">{create.error instanceof ApiError ? create.error.message : 'We couldn’t file that. Try again.'}</p>}
            <div className="sm:col-span-2"><Button disabled={!form.bookingId || form.description.trim().length < 5 || needsPhoto || uploading} loading={create.isPending} onClick={() => create.mutate()}>Submit claim</Button></div>
          </CardContent>
        </Card>
      )}

      {list.isLoading && <Skeleton className="h-40 w-full" />}

      {list.isError && <ErrorState message="We couldn’t load your claims." retry={() => void list.refetch()} />}
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
                  <Badge tone={CLAIM_LIST_TONE[c.status] ?? 'muted'}>{c.status}</Badge>
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
