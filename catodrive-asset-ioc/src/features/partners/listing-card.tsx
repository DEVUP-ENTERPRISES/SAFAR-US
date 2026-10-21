'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { partnerManageApi } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';

const manage = partnerManageApi('/ioc');

/** Turns an approved car into a draft listing on CatoDrive's fleet, tagged to its partner. */
export function ListingCard({ applicationId, vehicleId }: { applicationId: string; vehicleId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [address, setAddress] = useState('');
  const [details, setDetails] = useState({ transmission: '', fuelType: '', seats: '', bodyType: '' });
  const [needsDetails, setNeedsDetails] = useState(false);

  const create = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      manage.createListing(applicationId, {
        address: address.trim() || undefined,
        transmission: details.transmission || undefined,
        fuelType: details.fuelType || undefined,
        seats: details.seats ? Number(details.seats) : undefined,
        bodyType: details.bodyType || undefined,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['asset-partner-application', applicationId] });
      router.push(`/ops/listings/${r.vehicleId}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && /Still needs/.test(e.message)) setNeedsDetails(true);
    },
  });

  if (vehicleId) {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex flex-col gap-3 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><Car className="h-4 w-4 text-success" /> This car is on the fleet as a draft listing.</span>
          <Link href={`/ops/listings/${vehicleId}`}><Button size="sm" variant="outline" className="w-full sm:w-auto">Open listing <ArrowRight className="h-4 w-4" /></Button></Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="flex items-center gap-2 font-semibold"><Car className="h-4 w-4 text-primary" /> Put this car on the fleet</p>
          <p className="mt-1 text-sm text-muted-foreground">Creates a draft listing from the VIN with the partner’s photos, tagged to this partner so their statements and dashboard follow it. Set the price and publish it after the inspection.</p>
        </div>
        <Field label="Where the car will be based" htmlFor="base" hint="Leave empty to use the same place as the rest of the fleet.">
          <Input id="base" value={address} maxLength={300} placeholder="e.g. DFW Airport, Terminal D" onChange={(e) => setAddress(e.target.value)} />
        </Field>
        {needsDetails && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Gearbox"><Select value={details.transmission} onChange={(e) => setDetails({ ...details, transmission: e.target.value })}><option value="">—</option><option value="automatic">Automatic</option><option value="manual">Manual</option></Select></Field>
            <Field label="Fuel"><Select value={details.fuelType} onChange={(e) => setDetails({ ...details, fuelType: e.target.value })}><option value="">—</option><option value="petrol">Petrol</option><option value="hybrid">Hybrid</option><option value="ev">Electric</option><option value="diesel">Diesel</option></Select></Field>
            <Field label="Seats"><Input inputMode="numeric" value={details.seats} onChange={(e) => setDetails({ ...details, seats: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Body"><Select value={details.bodyType} onChange={(e) => setDetails({ ...details, bodyType: e.target.value })}><option value="">—</option><option value="sedan">Sedan</option><option value="suv">SUV</option><option value="hatchback">Hatchback</option><option value="truck">Truck</option><option value="van">Van</option><option value="coupe">Coupe</option><option value="convertible">Convertible</option></Select></Field>
          </div>
        )}
        {create.isError && <p role="alert" className="text-sm text-destructive">{create.error instanceof ApiError ? create.error.message : 'That didn’t work'}</p>}
        <Button className="w-full sm:w-auto" loading={create.isPending} onClick={() => create.mutate()}>Create draft listing</Button>
      </CardContent>
    </Card>
  );
}
