'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign, MapPin, SlidersHorizontal, Camera, FileText, ShieldCheck, CalendarX, Star, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { SectionLabel, RowGroup, Row } from '@/components/ui/rows';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatMoney } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { useVehicle } from '@/features/vehicles/hooks';
import { vehicleApi } from '@/features/vehicles/api';
import { api } from '@/lib/api/client';
import { hostApi } from '@/features/host/api';

type Panel = null | 'pricing' | 'photos' | 'availability' | 'details' | 'safety';

export default function ManageListingPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: v, isLoading, isError } = useVehicle(id);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['vehicle', id] });

  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const submit = useMutation({ mutationFn: () => vehicleApi.submit(id), onSuccess: invalidate });

  const [vin, setVin] = useState('');
  const verifyVin = useMutation({ mutationFn: () => vehicleApi.verifyVin(id, vin), onSuccess: invalidate });

  const [price, setPrice] = useState('');
  const updatePrice = useMutation({
    mutationFn: () => vehicleApi.updatePricing(id, { dailyPrice: Math.round(Number(price) * 100) }),
    onSuccess: () => { invalidate(); setPrice(''); },
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

  // Photos: presign → PUT bytes straight to S3 → attach the public URL.
  const [uploading, setUploading] = useState(false);
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const targets = await hostApi.uploadUrls('vehicle_photo', files.length, files[0].type || 'image/jpeg');
      await Promise.all(
        Array.from(files).map((f, i) =>
          fetch(targets[i].uploadUrl, {
            method: 'PUT',
            body: f,
            headers: { 'Content-Type': f.type || 'image/jpeg' },
          }),
        ),
      );
      await vehicleApi.addPhotos(id, targets.map((t) => ({ url: t.publicUrl, key: t.key })));
      invalidate();
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (isError || !v) return <ErrorState message="Listing not found." />;

  const savePrice = async () => {
    const { ok } = await confirm({
      title: `Change the daily price to $${Number(price).toFixed(2)}?`,
      description: 'New quotes use this price immediately. Trips already booked keep the price they were quoted.',
      confirmLabel: 'Save price',
    });
    if (ok) updatePrice.mutate();
  };

  const doBlock = async () => {
    const { ok } = await confirm({
      title: 'Block these dates?',
      description: 'Guests will not be able to book this car for that window.',
      confirmLabel: 'Block dates',
      tone: 'destructive',
    });
    if (ok) setAvail.mutate('block');
  };

  const unlimited = !v.mileageLimit?.perDayKm;

  return (
    <div className="space-y-1 pb-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <div className="aspect-[16/9] w-full">
          {v.photos?.[0]?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.photos[0].url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center brand-gradient text-5xl font-black text-white/70">
              {v.make.slice(0, 1)}{v.model.slice(0, 1)}
            </div>
          )}
        </div>
        <span
          className={cn(
            'absolute left-4 top-4 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase',
            v.status === 'listed' ? 'bg-success text-success-foreground' : 'bg-foreground/80 text-background',
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" /> {v.status}
        </span>
        <a
          href={`/vehicles/${v._id}`}
          className="absolute inset-x-0 bottom-0 bg-foreground/70 py-2.5 text-center text-sm font-semibold text-background backdrop-blur transition-colors hover:bg-foreground/85"
        >
          View listing
        </a>
      </div>

      {/* Title */}
      <div className="pt-4">
        <h1 className="display text-2xl">{v.make} {v.model} {v.year}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono">{v.registrationNumber ?? 'No plate'}</span> ·{' '}
          <span className="capitalize">{v.category}</span>
        </p>
        {v.ratingCount > 0 && (
          <p className="mt-1 flex items-center gap-1 text-sm font-medium">
            <Star className="h-4 w-4 fill-primary text-primary" /> {v.ratingAvg.toFixed(1)}
            <span className="text-muted-foreground">({v.totalTrips} trips)</span>
          </p>
        )}
      </div>

      {/* Menu */}
      <div className="pt-4">
        <RowGroup>
          <Row
            icon={<DollarSign className="h-5 w-5" />}
            title="Pricing & discounts"
            subtitle={`${formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })} / day`}
            onClick={() => toggle('pricing')}
          />
          {panel === 'pricing' && (
            <div className="space-y-3 bg-subtle px-4 py-4">
              <Field label="Daily price ($)">
                <Input
                  type="number"
                  value={price}
                  placeholder={String(v.pricing.dailyPrice / 100)}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
              <Button size="sm" disabled={!price} loading={updatePrice.isPending} onClick={savePrice}>
                Save price
              </Button>
            </div>
          )}

          <Row
            icon={<MapPin className="h-5 w-5" />}
            title="Location & delivery"
            subtitle={v.location?.address ?? v.location?.city ?? 'Not set'}
            value={
              v.listing?.delivery &&
              (v.listing.delivery.airport || v.listing.delivery.home || v.listing.delivery.hotel)
                ? 'Delivery on'
                : 'Pickup only'
            }
          />

          <Row
            icon={<SlidersHorizontal className="h-5 w-5" />}
            title="Trip preferences"
            subtitle={
              unlimited
                ? 'Unlimited mileage'
                : `${v.mileageLimit!.perDayKm} km/day included · ${formatMoney({
                    amount: v.mileageLimit!.overageFeePerKm,
                    currency: v.pricing.currency,
                  })}/km over`
            }
            value={v.listing?.instantBook ? 'Instant Book' : 'Request'}
          />

          <Row
            icon={<Camera className="h-5 w-5" />}
            title="Photos"
            subtitle={`${v.photos?.length ?? 0} uploaded`}
            onClick={() => toggle('photos')}
          />
          {panel === 'photos' && (
            <div className="space-y-3 bg-subtle px-4 py-4">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-sm transition-colors hover:border-primary/50">
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
                {uploading ? (
                  <><Upload className="h-4 w-4 animate-pulse text-primary" /> Uploading…</>
                ) : (
                  <><Camera className="h-4 w-4" /> Add photos</>
                )}
              </label>
              {v.photos && v.photos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {v.photos.slice(0, 8).map((p, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  ))}
                </div>
              )}
            </div>
          )}

          <Row
            icon={<FileText className="h-5 w-5" />}
            title="Details"
            subtitle={`${v.seats} seats · ${v.transmission} · ${v.fuelType}`}
            value={v.vinVerified ? 'VIN verified' : 'VIN pending'}
            onClick={() => toggle('details')}
          />
          {panel === 'details' && (
            <div className="space-y-3 bg-subtle px-4 py-4">
              {v.vinVerified ? (
                <p className="text-sm text-success">✓ VIN verified</p>
              ) : (
                <>
                  <Field label="VIN" hint="11–17 characters">
                    <Input value={vin} onChange={(e) => setVin(e.target.value)} />
                  </Field>
                  <Button size="sm" loading={verifyVin.isPending} onClick={() => verifyVin.mutate()}>
                    Verify VIN
                  </Button>
                </>
              )}
            </div>
          )}

          <Row
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Safety & inspections"
            subtitle="Registration and insurance documents"
            onClick={() => toggle('safety')}
          />
          {panel === 'safety' && (
            <div className="flex gap-2 bg-subtle px-4 py-4">
              <Button size="sm" variant="outline" loading={docUpload.isPending} onClick={() => docUpload.mutate('registration')}>
                Upload registration
              </Button>
              <Button size="sm" variant="outline" loading={docUpload.isPending} onClick={() => docUpload.mutate('insurance')}>
                Upload insurance
              </Button>
            </div>
          )}

          <Row
            icon={<CalendarX className="h-5 w-5" />}
            title="Block dates"
            subtitle="Make the car unavailable for a window"
            onClick={() => toggle('availability')}
          />
          {panel === 'availability' && (
            <div className="space-y-3 bg-subtle px-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                <Field label="From">
                  <Input type="date" value={block.start} onChange={(e) => setBlock({ ...block, start: e.target.value })} />
                </Field>
                <Field label="To">
                  <Input type="date" value={block.end} onChange={(e) => setBlock({ ...block, end: e.target.value })} />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={!block.start || !block.end} loading={setAvail.isPending} onClick={doBlock}>
                  Block
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!block.start || !block.end}
                  onClick={() => setAvail.mutate('unblock')}
                >
                  Unblock
                </Button>
              </div>
            </div>
          )}
        </RowGroup>
      </div>

      {/* Status */}
      <SectionLabel>Status</SectionLabel>
      <RowGroup>
        <Row
          title={v.status === 'listed' ? 'Listed' : `Status: ${v.status}`}
          subtitle={
            v.status === 'listed'
              ? 'Your car appears in search results and can be booked.'
              : v.verificationStatus === 'verified'
                ? 'Verified but not listed.'
                : 'Submit for verification to go live.'
          }
          action={
            v.status === 'draft'
              ? { label: 'Submit', onClick: () => submit.mutate() }
              : undefined
          }
        />
      </RowGroup>

      <p className="px-1 pt-4 font-mono text-xs text-muted-foreground">
        VIN #{v.vin ?? '—'}
      </p>
    </div>
  );
}
