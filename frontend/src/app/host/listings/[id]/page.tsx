'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign, MapPin, SlidersHorizontal, Camera, FileText, ShieldCheck, CalendarX, Star,
  Upload, Trash2, AlertTriangle, Check, Power, TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { SectionLabel, RowGroup, Row } from '@/components/ui/rows';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { useVehicle } from '@/features/vehicles/hooks';
import { vehicleApi } from '@/features/vehicles/api';
import { api } from '@/lib/api/client';
import { hostApi } from '@/features/host/api';
import { LocationSearch } from '@/features/maps/components/location-search';
import { PickupEditor } from '@/features/vehicles/components/pickup-editor';

type Panel = null | 'pricing' | 'photos' | 'availability' | 'details' | 'safety' | 'location' | 'trip';

export default function ManageListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const notify = useToast();
  const { data: v, isLoading, isError } = useVehicle(id);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['vehicle', id] });
    qc.invalidateQueries({ queryKey: ['my-vehicles'] });
  };

  // The photo minimum is the server's rule; never a number typed twice.
  const reqs = useQuery({ queryKey: ['listing-requirements'], queryFn: () => vehicleApi.requirements() });
  const minPhotos = reqs.data?.minPhotos ?? 4;

  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const submit = useMutation({ mutationFn: () => vehicleApi.submit(id), onSuccess: invalidate });

  const [vin, setVin] = useState('');
  const verifyVin = useMutation({ mutationFn: () => vehicleApi.verifyVin(id, vin), onSuccess: invalidate });

  const updatePricingM = useMutation({
    mutationFn: (patch: Record<string, unknown>) => vehicleApi.updatePricing(id, patch),
    onSuccess: () => { invalidate(); notify({ tone: 'success', title: 'Pricing updated' }); },
  });

  const [block, setBlock] = useState({ start: '', end: '' });
  const availability = useQuery({
    queryKey: ['vehicle-availability', id],
    queryFn: () =>
      vehicleApi.getCalendar(
        id,
        new Date().toISOString(),
        new Date(Date.now() + 90 * 86_400_000).toISOString(),
      ),
    enabled: panel === 'availability',
  });
  const invalidateAvail = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ['vehicle-availability', id] });
  };
  const setAvail = useMutation({
    mutationFn: ({ action, start, end }: { action: 'block' | 'unblock'; start: string; end: string }) =>
      vehicleApi.setAvailability(id, new Date(start).toISOString(), new Date(end).toISOString(), action),
    onSuccess: (_r, { action }) => {
      invalidateAvail();
      notify({ tone: 'success', title: action === 'block' ? 'Dates blocked' : 'Dates reopened' });
    },
  });
  const blockedRanges = groupRanges(
    (availability.data ?? []).filter((d) => d.state === 'blocked').map((d) => d.dayKey).sort(),
  );

  // Generic field editor — every listing attribute goes through PUT /vehicles/:id.
  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => vehicleApi.update(id, patch),
    onSuccess: () => { invalidate(); notify({ tone: 'success', title: 'Listing updated' }); },
  });

  const removePhoto = useMutation({
    mutationFn: (key: string) => vehicleApi.removePhoto(id, key),
    onSuccess: invalidate,
  });
  const setCover = useMutation({
    mutationFn: (key: string) => vehicleApi.setCoverPhoto(id, key),
    onSuccess: () => { invalidate(); notify({ tone: 'success', title: 'Cover photo updated' }); },
  });

  const delist = useMutation({
    mutationFn: () => vehicleApi.delist(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-vehicles'] });
      notify({ tone: 'success', title: 'Listing removed' });
      router.push('/host/listings');
    },
  });

  const docUpload = useMutation({
    mutationFn: async ({ category, file }: { category: 'registration' | 'insurance'; file: File }) => {
      const [target] = await hostApi.uploadUrls(category, 1, file.type || 'application/pdf');
      await putToStorage(target.uploadUrl, file);
      return api.post('/documents', { vehicleId: id, category, url: target.publicUrl, key: target.key });
    },
    onSuccess: () => { invalidate(); notify({ tone: 'success', title: 'Document uploaded' }); },
  });

  // Photos: presign → PUT bytes straight to S3 → attach the public URL.
  const [uploading, setUploading] = useState(false);
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const list = Array.from(files);
      const targets = await hostApi.uploadUrls('vehicle_photo', list.length, list[0].type || 'image/jpeg');
      await Promise.all(list.map((f, i) => putToStorage(targets[i].uploadUrl, f)));
      await vehicleApi.addPhotos(id, targets.map((t) => ({ url: t.publicUrl, key: t.key })));
      invalidate();
      notify({ tone: 'success', title: `${list.length} photo${list.length === 1 ? '' : 's'} added` });
    } catch (err) {
      notify({
        tone: 'error',
        title: 'Photo upload failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (isError || !v) return <ErrorState message="Listing not found." />;

  const photos = v.photos ?? [];
  const cover = photos.find((p) => p.isCover) ?? photos[0];
  const photosNeeded = Math.max(0, minPhotos - photos.length);
  const canSubmit = v.status === 'draft' && photosNeeded === 0;

  const doBlock = async () => {
    const { ok } = await confirm({
      title: 'Block these dates?',
      description: 'Guests will not be able to book this car for that window.',
      confirmLabel: 'Block dates',
      tone: 'destructive',
    });
    if (ok) setAvail.mutate({ action: 'block', start: block.start, end: block.end });
  };

  const doSubmit = async () => {
    const { ok } = await confirm({
      title: 'Submit for verification?',
      description:
        'Our team reviews the car and its documents. You cannot edit the listing while it is in review, and it goes live once approved.',
      confirmLabel: 'Submit listing',
    });
    if (ok) submit.mutate();
  };

  const doRemovePhoto = async (key: string, isCover: boolean) => {
    const { ok } = await confirm({
      title: 'Delete this photo?',
      description: isCover
        ? 'This is the cover photo — the next photo becomes the cover. This cannot be undone.'
        : 'This cannot be undone. You can upload it again later.',
      confirmLabel: 'Delete photo',
      tone: 'destructive',
    });
    if (ok) removePhoto.mutate(key);
  };

  const doDelist = async () => {
    const { ok } = await confirm({
      title: `Remove ${v.make} ${v.model} from CATO?`,
      description:
        'The car stops appearing in search and can no longer be booked. Trips already booked are not cancelled — handle those first.',
      confirmLabel: 'Remove listing',
      tone: 'destructive',
      requireText: 'REMOVE',
    });
    if (ok) delist.mutate();
  };

  const unlimited = !v.mileageLimit?.perDayKm;

  return (
    <div className="space-y-1 pb-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <div className="aspect-[16/9] w-full">
          {cover?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 brand-gradient text-white/80">
              <Camera className="h-10 w-10" />
              <p className="text-sm font-semibold">No photos yet</p>
            </div>
          )}
        </div>
        <span
          className={cn(
            'absolute start-4 top-4 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase',
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
        {/* The financial view of this car, which is a different question from
            how it is configured. */}
        <Link
          href={`/host/listings/${id}/insights`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
        >
          <TrendingUp className="h-4 w-4" /> Earnings &amp; performance
        </Link>
      </div>

      {/* Blocking requirement, stated before they hit Submit and get rejected. */}
      {photosNeeded > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold">
              {photosNeeded} more photo{photosNeeded === 1 ? '' : 's'} required
            </p>
            <p className="text-sm text-muted-foreground">
              Listings need at least {minPhotos} photos before they can be submitted for verification.
            </p>
            <button
              onClick={() => setPanel('photos')}
              className="mt-1.5 text-sm font-semibold text-primary hover:underline"
            >
              Add photos
            </button>
          </div>
        </div>
      )}

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
            <PricingPanel vehicle={v} onSave={(patch) => updatePricingM.mutate(patch)} saving={updatePricingM.isPending} />
          )}

          <Row
            icon={<MapPin className="h-5 w-5" />}
            title="Location & delivery"
            subtitle={v.location?.address || v.location?.city || 'Not set'}
            value={
              v.listing?.delivery &&
              (v.listing.delivery.airport || v.listing.delivery.home || v.listing.delivery.hotel)
                ? 'Delivery on'
                : 'Pickup only'
            }
            onClick={() => toggle('location')}
          />
          {panel === 'location' && (
            <LocationPanel vehicle={v} onSave={(patch) => update.mutate(patch)} saving={update.isPending} />
          )}

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
            onClick={() => toggle('trip')}
          />
          {panel === 'trip' && (
            <TripPanel vehicle={v} onSave={(patch) => update.mutate(patch)} saving={update.isPending} />
          )}

          <Row
            icon={<Camera className="h-5 w-5" />}
            title="Photos"
            subtitle={
              photos.length === 0
                ? `None yet — ${minPhotos} required`
                : `${photos.length} uploaded${photosNeeded > 0 ? ` · ${photosNeeded} more required` : ''}`
            }
            onClick={() => toggle('photos')}
          />
          {panel === 'photos' && (
            <div className="space-y-3 bg-subtle px-4 py-4">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-sm transition-colors hover:border-primary/50">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
                />
                {uploading ? (
                  <><Upload className="h-4 w-4 animate-pulse text-primary" /> Uploading…</>
                ) : (
                  <><Camera className="h-4 w-4" /> Add photos</>
                )}
              </label>

              {photos.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">
                    The cover photo is what guests see in search results. Click a photo to make it the cover.
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {photos.map((p) => {
                      const isCover = p.isCover || p.key === cover?.key;
                      return (
                        <div key={p.key ?? p.url} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt="" className="h-full w-full object-cover" />

                          {isCover && (
                            <span className="absolute start-1 top-1 flex items-center gap-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-background">
                              <Check className="h-3 w-3" /> Cover
                            </span>
                          )}

                          {p.key && !isCover && (
                            <button
                              onClick={() => setCover.mutate(p.key!)}
                              className="absolute inset-0 bg-foreground/50 text-xs font-semibold text-background opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              Make cover
                            </button>
                          )}

                          {p.key && (
                            <button
                              onClick={() => doRemovePhoto(p.key!, isCover)}
                              aria-label="Delete photo"
                              className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
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
            <div className="space-y-4 bg-subtle px-4 py-4">
              <DetailsPanel vehicle={v} onSave={(patch) => update.mutate(patch)} saving={update.isPending} />
              <div className="border-t border-border pt-4">
                {v.vinVerified ? (
                  <p className="text-sm text-success">✓ VIN verified</p>
                ) : (
                  <div className="space-y-2">
                    <Field label="VIN" hint="11–17 characters">
                      <Input value={vin} onChange={(e) => setVin(e.target.value)} />
                    </Field>
                    <Button size="sm" disabled={!vin.trim()} loading={verifyVin.isPending} onClick={() => verifyVin.mutate()}>
                      Verify VIN
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <Row
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Safety & inspections"
            subtitle="Registration and insurance documents"
            onClick={() => toggle('safety')}
          />
          {panel === 'safety' && (
            <div className="flex flex-wrap gap-2 bg-subtle px-4 py-4">
              {(['registration', 'insurance'] as const).map((category) => (
                <label
                  key={category}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium capitalize transition-colors hover:border-primary/50"
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) docUpload.mutate({ category, file });
                    }}
                  />
                  <Upload className="h-4 w-4" /> Upload {category}
                </label>
              ))}
              {docUpload.isPending && <span className="self-center text-sm text-muted-foreground">Uploading…</span>}
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
                  <Input type="date" min={block.start || undefined} value={block.end} onChange={(e) => setBlock({ ...block, end: e.target.value })} />
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
                  onClick={() => setAvail.mutate({ action: 'unblock', start: block.start, end: block.end })}
                >
                  Unblock
                </Button>
              </div>

              {/* What's currently blocked, next 90 days — tap ✕ to reopen a window. */}
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currently blocked</p>
                {availability.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : blockedRanges.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No blocked dates in the next 90 days.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {blockedRanges.map((r) => (
                      <span key={r.from} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
                        {fmtRange(r.from, r.to)}
                        <button
                          onClick={() => setAvail.mutate({ action: 'unblock', start: r.from, end: r.to })}
                          aria-label="Reopen these dates"
                          className="rounded-full text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </RowGroup>
      </div>

      {/* Pickup details — dormant until now: the fields existed on the model
          and had no editor, so the guest-facing panel never had anything to
          show. */}
      <SectionLabel>Pickup</SectionLabel>
      <PickupEditor vehicleId={id} initial={v.pickup} onSaved={invalidate} />

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
                : photosNeeded > 0
                  ? `Add ${photosNeeded} more photo${photosNeeded === 1 ? '' : 's'} to submit for verification.`
                  : 'Submit for verification to go live.'
          }
          action={
            v.status === 'draft'
              ? { label: submit.isPending ? 'Submitting…' : 'Submit', onClick: doSubmit, disabled: !canSubmit || submit.isPending }
              : undefined
          }
        />
      </RowGroup>

      {/* Destructive actions live apart from everyday edits. */}
      <SectionLabel>Danger zone</SectionLabel>
      <RowGroup className="border-destructive/30">
        <Row
          icon={<Power className="h-5 w-5 text-destructive" />}
          title="Remove this listing"
          subtitle="Stops new bookings and hides the car from search."
          action={{ label: delist.isPending ? 'Removing…' : 'Remove', onClick: doDelist, disabled: delist.isPending }}
        />
      </RowGroup>

      <p className="px-1 pt-4 font-mono text-xs text-muted-foreground">
        VIN #{v.vin ?? '—'}
      </p>
    </div>
  );
}

/**
 * A presigned PUT that reports failure. `fetch` resolves for 4xx/5xx, so the
 * previous version treated a rejected upload as success and attached a URL to
 * an object that was never stored — the photo then rendered broken.
 */
/** Collapse a sorted list of YYYY-MM-DD day keys into contiguous ranges. */
function groupRanges(days: string[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const nextDay = (d: string) => {
    const t = new Date(d + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  };
  for (const day of days) {
    const last = out[out.length - 1];
    if (last && nextDay(last.to) === day) last.to = day;
    else out.push({ from: day, to: day });
  }
  return out;
}

/** "Mar 3" or "Mar 3 – Mar 7" for a blocked range chip. */
function fmtRange(from: string, to: string): string {
  const f = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
}

async function putToStorage(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!res.ok) {
    throw new Error(`Storage rejected the upload (${res.status}). Check the bucket CORS rules.`);
  }
}

type Vehicle = NonNullable<ReturnType<typeof useVehicle>['data']>;
type SaveFn = (patch: Record<string, unknown>) => void;

function LocationPanel({ vehicle, onSave, saving }: { vehicle: Vehicle; onSave: SaveFn; saving: boolean }) {
  const [loc, setLoc] = useState<{ lat: number; lng: number; city: string; address: string } | null>(null);
  const d = vehicle.listing?.delivery;
  const [delivery, setDelivery] = useState({
    airport: !!d?.airport, home: !!d?.home, hotel: !!d?.hotel, business: !!d?.business,
    fee: String(((d?.fee ?? 0) / 100) || ''),
  });

  const modes = [
    ['home', 'Guest address'], ['airport', 'Airport'], ['hotel', 'Hotel'], ['business', 'Business'],
  ] as const;

  return (
    <div className="space-y-4 bg-subtle px-4 py-4">
      <Field label="Pickup location" hint={loc ? `Will be saved as ${loc.city}` : `Currently ${vehicle.location?.city || 'unset'}`}>
        <LocationSearch
          placeholder="Search a new address"
          onPick={(p) => setLoc({ lat: p.lat, lng: p.lng, city: p.city, address: p.label })}
        />
      </Field>

      <div>
        <p className="mb-2 text-sm font-medium">Delivery options</p>
        <div className="flex flex-wrap gap-2">
          {modes.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDelivery((s) => ({ ...s, [key]: !s[key] }))}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                delivery[key] ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Field label="Delivery fee ($)" hint="Flat fee charged when a guest requests delivery">
        <Input
          type="number"
          min={0}
          value={delivery.fee}
          onChange={(e) => setDelivery({ ...delivery, fee: e.target.value })}
        />
      </Field>

      <Button
        size="sm"
        loading={saving}
        onClick={() =>
          onSave({
            ...(loc ? { location: loc } : {}),
            // Send only what this panel owns. The server merges into the stored
            // listing, so spreading a render-time snapshot here would silently
            // revert whatever another panel changed in the meantime.
            listing: {
              delivery: {
                ...vehicle.listing?.delivery,
                airport: delivery.airport, home: delivery.home,
                hotel: delivery.hotel, business: delivery.business,
                fee: Math.round(Number(delivery.fee || 0) * 100),
              },
            },
          })
        }
      >
        Save location & delivery
      </Button>
    </div>
  );
}

function TripPanel({ vehicle, onSave, saving }: { vehicle: Vehicle; onSave: SaveFn; saving: boolean }) {
  const l = vehicle.listing;
  const [instantBook, setInstantBook] = useState(!!l?.instantBook);
  const [policy, setPolicy] = useState(l?.cancellationPolicy ?? 'moderate');
  // Hours are stored; hosts think in days for trip length, hours for notice.
  const [minDays, setMinDays] = useState(String(Math.max(1, Math.round((l?.minTripHours ?? 24) / 24))));
  const [maxDays, setMaxDays] = useState(String(Math.max(1, Math.round((l?.maxTripHours ?? 720) / 24))));
  const [turnaround, setTurnaround] = useState(String(l?.turnaroundDays ?? 0));
  const [notice, setNotice] = useState(String(l?.advanceNoticeHours ?? 0));

  return (
    <div className="space-y-4 bg-subtle px-4 py-4">
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Instant Book</span>
          <span className="block text-xs text-muted-foreground">
            Guests book without waiting for your approval. Listings with it on get booked more.
          </span>
        </span>
        <input
          type="checkbox"
          checked={instantBook}
          onChange={(e) => setInstantBook(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-[var(--primary)]"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Minimum trip (days)">
          <Input type="number" min={1} value={minDays} onChange={(e) => setMinDays(e.target.value)} />
        </Field>
        <Field label="Maximum trip (days)">
          <Input type="number" min={1} value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />
        </Field>
        <Field label="Turnaround (days)" hint="Buffer kept free after each trip">
          <Input type="number" min={0} max={7} value={turnaround} onChange={(e) => setTurnaround(e.target.value)} />
        </Field>
        <Field label="Advance notice (hours)" hint="Lead time before a trip can start">
          <Input type="number" min={0} max={720} value={notice} onChange={(e) => setNotice(e.target.value)} />
        </Field>
      </div>

      <Field label="Cancellation policy">
        <Select
          value={policy}
          onChange={(e) => setPolicy(e.target.value as typeof policy)}
        >
          <option value="flexible">Flexible — free cancellation up to 24h before</option>
          <option value="moderate">Moderate — free up to 3 days before</option>
          <option value="strict">Strict — free up to 7 days before</option>
        </Select>
      </Field>

      <Button
        size="sm"
        loading={saving}
        onClick={() =>
          onSave({
            listing: {
              instantBook,
              cancellationPolicy: policy,
              minTripHours: Math.max(1, Number(minDays) || 1) * 24,
              maxTripHours: Math.max(1, Number(maxDays) || 1) * 24,
              turnaroundDays: Math.min(7, Math.max(0, Number(turnaround) || 0)),
              advanceNoticeHours: Math.min(720, Math.max(0, Number(notice) || 0)),
            },
          })
        }
      >
        Save trip preferences
      </Button>
    </div>
  );
}

/**
 * Everything that moves the price: the daily rate, the fixed fees, the weekend
 * uplift, length-of-stay discounts, early-bird / last-minute nudges, and any
 * number of dated seasonal rules. Percentages are shown to the host and stored
 * as basis points (the engine's unit) so what they type is what a guest pays.
 */
function PricingPanel({ vehicle, onSave, saving }: { vehicle: Vehicle; onSave: SaveFn; saving: boolean }) {
  const p = vehicle.pricing;
  const cur = p.currency;
  const pctFromBps = (bps?: number) => String(bps ? Math.round(bps / 100) : 0);
  const upliftFromBps = (bps?: number) => String(bps ? Math.round((bps - 10000) / 100) : 0);

  const [daily, setDaily] = useState(String(p.dailyPrice / 100));
  const [cleaning, setCleaning] = useState(String((p.cleaningFee ?? 0) / 100));
  const [weekend, setWeekend] = useState(upliftFromBps(p.weekendMultiplierBps));
  const [weekly, setWeekly] = useState(pctFromBps(p.weeklyDiscountBps));
  const [monthly, setMonthly] = useState(pctFromBps(p.monthlyDiscountBps));
  const [earlyBird, setEarlyBird] = useState(pctFromBps(p.earlyBirdBps));
  const [lastMinute, setLastMinute] = useState(pctFromBps(p.lastMinuteBps));
  const [rules, setRules] = useState(
    (p.seasonalRules ?? []).map((r) => ({
      label: r.label,
      start: r.start.slice(0, 10),
      end: r.end.slice(0, 10),
      pct: String(Math.round(r.multiplierBps / 100)),
    })),
  );

  const num = (s: string) => Number(s) || 0;
  const addRule = () => setRules((rs) => [...rs, { label: '', start: '', end: '', pct: '150' }]);
  const setRule = (i: number, patch: Partial<(typeof rules)[number]>) =>
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, j) => j !== i));

  const save = () =>
    onSave({
      dailyPrice: Math.round(num(daily) * 100),
      cleaningFee: Math.round(num(cleaning) * 100),
      weekendMultiplierBps: 10000 + Math.max(0, num(weekend)) * 100,
      weeklyDiscountBps: Math.min(90, Math.max(0, num(weekly))) * 100,
      monthlyDiscountBps: Math.min(90, Math.max(0, num(monthly))) * 100,
      earlyBirdBps: Math.min(50, Math.max(0, num(earlyBird))) * 100,
      lastMinuteBps: Math.min(50, Math.max(0, num(lastMinute))) * 100,
      seasonalRules: rules
        .filter((r) => r.label.trim() && r.start && r.end)
        .map((r) => ({
          label: r.label.trim(),
          start: r.start,
          end: r.end,
          multiplierBps: Math.min(300, Math.max(10, num(r.pct))) * 100,
        })),
    });

  return (
    <div className="space-y-4 bg-subtle px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Daily price (${cur})`}>
          <Input type="number" min={1} value={daily} onChange={(e) => setDaily(e.target.value)} />
        </Field>
        <Field label={`Cleaning fee (${cur})`}>
          <Input type="number" min={0} value={cleaning} onChange={(e) => setCleaning(e.target.value)} />
        </Field>
        <Field label="Weekend uplift (%)" hint="Added Fri–Sun">
          <Input type="number" min={0} value={weekend} onChange={(e) => setWeekend(e.target.value)} />
        </Field>
        <Field label="Weekly discount (%)" hint="7+ day trips">
          <Input type="number" min={0} max={90} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        </Field>
        <Field label="Monthly discount (%)" hint="28+ day trips">
          <Input type="number" min={0} max={90} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </Field>
        <Field label="Early-bird (%)" hint="Booked well ahead">
          <Input type="number" min={0} max={50} value={earlyBird} onChange={(e) => setEarlyBird(e.target.value)} />
        </Field>
        <Field label="Last-minute (%)" hint="Fills idle days">
          <Input type="number" min={0} max={50} value={lastMinute} onChange={(e) => setLastMinute(e.target.value)} />
        </Field>
      </div>

      {/* Seasonal rules */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Seasonal pricing</p>
          <button onClick={addRule} className="text-sm font-semibold text-primary hover:underline">+ Add rule</button>
        </div>
        <p className="text-xs text-muted-foreground">
          A multiplier for a date range — 150% charges half again as much (peak), 80% takes a fifth off (low season).
        </p>
        {rules.length === 0 && <p className="text-xs text-muted-foreground">No seasonal rules yet.</p>}
        {rules.map((r, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <Input value={r.label} placeholder="e.g. Holiday peak" onChange={(e) => setRule(i, { label: e.target.value })} />
              <button onClick={() => removeRule(i)} aria-label="Remove rule" className="shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Field label="From"><Input type="date" value={r.start} onChange={(e) => setRule(i, { start: e.target.value })} /></Field>
              <Field label="To"><Input type="date" min={r.start || undefined} value={r.end} onChange={(e) => setRule(i, { end: e.target.value })} /></Field>
              <Field label="Rate (%)"><Input type="number" min={10} max={300} value={r.pct} onChange={(e) => setRule(i, { pct: e.target.value })} /></Field>
            </div>
          </div>
        ))}
      </div>

      <Button size="sm" loading={saving} disabled={!daily} onClick={save}>
        Save pricing
      </Button>
    </div>
  );
}

function DetailsPanel({ vehicle, onSave, saving }: { vehicle: Vehicle; onSave: SaveFn; saving: boolean }) {
  const [title, setTitle] = useState(vehicle.listing?.title ?? '');
  const [description, setDescription] = useState(vehicle.listing?.description ?? '');
  const [features, setFeatures] = useState((vehicle.features ?? []).join(', '));

  return (
    <div className="space-y-3">
      <Field label="Listing title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </Field>
      <Field label="Features" hint="Comma separated">
        <Input value={features} onChange={(e) => setFeatures(e.target.value)} />
      </Field>
      <Button
        size="sm"
        loading={saving}
        disabled={!title.trim()}
        onClick={() =>
          onSave({
            listing: { title: title.trim(), description },
            features: features.split(',').map((f) => f.trim()).filter(Boolean),
          })
        }
      >
        Save details
      </Button>
    </div>
  );
}
