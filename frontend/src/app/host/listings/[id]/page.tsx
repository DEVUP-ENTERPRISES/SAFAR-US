'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useVehicle } from '@/features/vehicles/hooks';
import { vehicleApi } from '@/features/vehicles/api';
import { api } from '@/lib/api/client';
import { hostApi } from '@/features/host/api';

export default function ManageListingPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: v, isLoading, isError } = useVehicle(id);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['vehicle', id] });

  const submit = useMutation({ mutationFn: () => vehicleApi.submit(id), onSuccess: invalidate });
  const [vin, setVin] = useState('');
  const verifyVin = useMutation({ mutationFn: () => vehicleApi.verifyVin(id, vin), onSuccess: invalidate });

  const [price, setPrice] = useState('');
  const updatePrice = useMutation({
    mutationFn: () => vehicleApi.updatePricing(id, { dailyPrice: Math.round(Number(price) * 100) }),
    onSuccess: invalidate,
  });

  const [block, setBlock] = useState({ start: '', end: '' });
  const setAvail = useMutation({
    mutationFn: (action: 'block' | 'unblock') =>
      vehicleApi.setAvailability(id, new Date(block.start).toISOString(), new Date(block.end).toISOString(), action),
  });

  const docUpload = useMutation({
    mutationFn: async (category: 'registration' | 'insurance') => {
      const [target] = await hostApi.uploadUrls(category, 1);
      return api.post('/documents', { vehicleId: id, category, url: target.publicUrl, key: target.key });
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !v) return <ErrorState message="Listing not found." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {v.make} {v.model} · {v.year}
          </h1>
          <div className="mt-1 flex gap-2">
            <Badge tone={v.status === 'listed' ? 'success' : 'warning'}>{v.status}</Badge>
            <Badge tone={v.verificationStatus === 'verified' ? 'success' : 'muted'}>{v.verificationStatus}</Badge>
          </div>
        </div>
        {v.status === 'draft' && (
          <Button loading={submit.isPending} onClick={() => submit.mutate()}>
            Submit for verification
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>VIN verification</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {v.vinVerified ? (
              <Badge tone="success">VIN verified</Badge>
            ) : (
              <>
                <Field label="VIN" hint="11–17 characters"><Input value={vin} onChange={(e) => setVin(e.target.value)} /></Field>
                <Button size="sm" loading={verifyVin.isPending} onClick={() => verifyVin.mutate()}>Verify VIN</Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quick price update</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Daily price (₹)"><Input type="number" value={price} placeholder={String(v.pricing.dailyPrice / 100)} onChange={(e) => setPrice(e.target.value)} /></Field>
            <Button size="sm" disabled={!price} loading={updatePrice.isPending} onClick={() => updatePrice.mutate()}>Save price</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Button size="sm" variant="outline" loading={docUpload.isPending} onClick={() => docUpload.mutate('registration')}>Upload registration</Button>
            <Button size="sm" variant="outline" loading={docUpload.isPending} onClick={() => docUpload.mutate('insurance')}>Upload insurance</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Block dates (blackout)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="From"><Input type="date" value={block.start} onChange={(e) => setBlock({ ...block, start: e.target.value })} /></Field>
              <Field label="To"><Input type="date" value={block.end} onChange={(e) => setBlock({ ...block, end: e.target.value })} /></Field>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={!block.start || !block.end} loading={setAvail.isPending} onClick={() => setAvail.mutate('block')}>Block</Button>
              <Button size="sm" variant="outline" disabled={!block.start || !block.end} onClick={() => setAvail.mutate('unblock')}>Unblock</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
