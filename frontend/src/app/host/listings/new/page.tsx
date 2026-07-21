'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ImagePlus, Loader2, X, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/types';
import { vehicleApi, type CreateVehicleInput } from '@/features/vehicles/api';
import { hostApi } from '@/features/host/api';
import { useToast } from '@/components/ui/toast';
import { LocationSearch } from '@/features/maps/components/location-search';

const STEPS = ['Basics', 'Details', 'Photos', 'Pricing', 'Delivery', 'Review'];

interface Draft {
  make: string;
  model: string;
  year: number;
  category: string;
  bodyType: string;
  transmission: 'manual' | 'automatic';
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  seats: number;
  city: string;
  address: string;
  lng: number | null;
  lat: number | null;
  color: string;
  doors: number;
  features: string;
  photos: { url: string; key?: string }[];
  title: string;
  description: string;
  instantBook: boolean;
  cancellationPolicy: 'flexible' | 'moderate' | 'strict';
  dailyPrice: number; // USD/day
  cleaningFee: number;
  weekendPct: number; // % premium
  weeklyDiscountPct: number;
  monthlyDiscountPct: number;
  earlyBirdPct: number;
  lastMinutePct: number;
  delivery: { airport: boolean; home: boolean; hotel: boolean; business: boolean; radiusKm: number; fee: number };
  addOnCodes: string[];
  tripRules: string;
  mileagePerDay: number;
  mileageOverage: number;
}

// Preset extras a host can offer (guest selects at checkout).
const ADDON_PRESETS: Record<string, { label: string; priceType: 'per_trip' | 'per_day'; amount: number }> = {
  child_seat: { label: 'Child seat', priceType: 'per_trip', amount: 15 },
  additional_driver: { label: 'Additional driver', priceType: 'per_day', amount: 10 },
  prepaid_fuel: { label: 'Prepaid fuel', priceType: 'per_trip', amount: 40 },
  unlimited_miles: { label: 'Unlimited miles', priceType: 'per_day', amount: 12 },
};

const initial: Draft = {
  make: '', model: '', year: 2022, category: 'economy', bodyType: 'sedan',
  transmission: 'automatic', fuelType: 'petrol', seats: 5,
  city: '', address: '', lng: null, lat: null, color: '', doors: 4, features: '',
  photos: [], title: '', description: '', instantBook: true, cancellationPolicy: 'moderate',
  dailyPrice: 65, cleaningFee: 25, weekendPct: 20, weeklyDiscountPct: 10, monthlyDiscountPct: 20,
  earlyBirdPct: 5, lastMinutePct: 0,
  delivery: { airport: false, home: false, hotel: false, business: false, radiusKm: 0, fee: 0 },
  addOnCodes: [], tripRules: '', mileagePerDay: 0, mileageOverage: 0,
};

export default function NewListingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const notify = useToast();
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  // The server owns the photo minimum; the wizard must not disagree with it.
  const reqs = useQuery({ queryKey: ['listing-requirements'], queryFn: () => vehicleApi.requirements() });
  const minPhotos = reqs.data?.minPhotos ?? 4;

  /**
   * Presign → PUT the bytes → keep the public URL. The previous version only
   * presigned and stored the URL, so the grid filled with addresses for objects
   * that were never uploaded and every tile rendered as a broken image.
   */
  const [uploading, setUploading] = useState(false);
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const list = Array.from(files);
      const targets = await hostApi.uploadUrls('vehicle_photo', list.length, list[0].type || 'image/jpeg');
      await Promise.all(
        list.map(async (f, i) => {
          const res = await fetch(targets[i].uploadUrl, {
            method: 'PUT',
            body: f,
            headers: { 'Content-Type': f.type || 'application/octet-stream' },
          });
          // fetch resolves on 4xx/5xx — without this a rejected upload would be
          // recorded as a photo.
          if (!res.ok) throw new Error(`Storage rejected the upload (${res.status}).`);
        }),
      );
      setD((prev) => ({
        ...prev,
        photos: [...prev.photos, ...targets.map((t) => ({ url: t.publicUrl, key: t.key }))],
      }));
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

  const smartPrice = useMutation({
    mutationFn: () => vehicleApi.priceSuggestion({ lng: d.lng!, lat: d.lat!, category: d.category, fuelType: d.fuelType }),
    onSuccess: (s) => set('dailyPrice', Math.round(s.suggested / 100)),
  });

  const create = useMutation({
    mutationFn: () => {
      const body: CreateVehicleInput = {
        make: d.make, model: d.model, year: Number(d.year), bodyType: d.bodyType, category: d.category,
        transmission: d.transmission, fuelType: d.fuelType, seats: Number(d.seats),
        specs: { color: d.color, doors: Number(d.doors) },
        features: d.features.split(',').map((f) => f.trim()).filter(Boolean),
        photos: d.photos,
        location: { lng: d.lng!, lat: d.lat!, address: d.address, city: d.city },
        listing: {
          title: d.title || `${d.make} ${d.model} ${d.year}`,
          description: d.description,
          instantBook: d.instantBook,
          minTripHours: 24,
          maxTripHours: 24 * 30,
          cancellationPolicy: d.cancellationPolicy,
          delivery: d.delivery,
        },
        addOns: d.addOnCodes.map((code) => ({
          code,
          label: ADDON_PRESETS[code].label,
          priceType: ADDON_PRESETS[code].priceType,
          amount: Math.round(ADDON_PRESETS[code].amount * 100),
        })),
        tripRules: d.tripRules.split('\n').map((r) => r.trim()).filter(Boolean),
        mileageLimit: { perDayKm: Number(d.mileagePerDay), overageFeePerKm: Math.round(d.mileageOverage * 100) },
        pricing: {
          dailyPrice: Math.round(d.dailyPrice * 100),
          currency: 'USD',
          cleaningFee: Math.round(d.cleaningFee * 100),
          weekendMultiplierBps: 10000 + Math.round(d.weekendPct * 100),
          weeklyDiscountBps: Math.round(d.weeklyDiscountPct * 100),
          monthlyDiscountBps: Math.round(d.monthlyDiscountPct * 100),
          earlyBirdBps: Math.round(d.earlyBirdPct * 100),
          lastMinuteBps: Math.round(d.lastMinutePct * 100),
          dynamicPricing: false,
        },
      };
      return vehicleApi.create(body);
    },
    onSuccess: (v) => router.push(`/host/listings/${v._id}`),
  });

  const canNext = () => {
    if (step === 0) return d.make && d.model;
    if (step === 2) return d.photos.length >= minPhotos;
    return true;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="display text-display-sm">List your vehicle</h1>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                i < step ? 'bg-primary text-primary-foreground' : i === step ? 'bg-primary/20 text-primary ring-2 ring-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Make"><Input value={d.make} onChange={(e) => set('make', e.target.value)} placeholder="Toyota" /></Field>
              <Field label="Model"><Input value={d.model} onChange={(e) => set('model', e.target.value)} placeholder="Camry" /></Field>
              <Field label="Year"><Input type="number" value={d.year} onChange={(e) => set('year', Number(e.target.value))} /></Field>
              <Field label="Seats"><Input type="number" value={d.seats} onChange={(e) => set('seats', Number(e.target.value))} /></Field>
              <SelectField label="Category" value={d.category} onChange={(v) => set('category', v)} options={['economy', 'luxury', 'suv', 'van', 'sports', 'ev']} />
              <SelectField label="Body type" value={d.bodyType} onChange={(v) => set('bodyType', v)} options={['sedan', 'suv', 'hatchback', 'coupe', 'van', 'truck']} />
              <SelectField label="Transmission" value={d.transmission} onChange={(v) => set('transmission', v as Draft['transmission'])} options={['automatic', 'manual']} />
              <SelectField label="Fuel" value={d.fuelType} onChange={(v) => set('fuelType', v as Draft['fuelType'])} options={['petrol', 'diesel', 'hybrid', 'ev']} />
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Where guests pick it up"
                className="sm:col-span-2"
                hint={d.city ? `Listed in ${d.city}` : 'Search any address — you are not limited to a fixed list of cities.'}
              >
                <LocationSearch
                  placeholder="Start typing an address or city"
                  onPick={(loc) => {
                    setD((prev) => ({
                      ...prev,
                      lat: loc.lat,
                      lng: loc.lng,
                      city: loc.city || prev.city,
                      address: loc.label,
                    }));
                  }}
                />
              </Field>
              <Field label="Pickup notes" className="sm:col-span-2" hint="Optional — where exactly to meet, parking, gate codes">
                <Input value={d.address} onChange={(e) => set('address', e.target.value)} placeholder="Garage level 2, spot 14" />
              </Field>
              <Field label="Color"><Input value={d.color} onChange={(e) => set('color', e.target.value)} /></Field>
              <Field label="Doors"><Input type="number" value={d.doors} onChange={(e) => set('doors', Number(e.target.value))} /></Field>
              <Field label="Features (comma separated)" className="sm:col-span-2"><Input value={d.features} onChange={(e) => set('features', e.target.value)} placeholder="gps, bluetooth, sunroof" /></Field>
              <Field label="Listing title" className="sm:col-span-2"><Input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder={`${d.make} ${d.model} ${d.year}`} /></Field>
              <Field label="Description" className="sm:col-span-2">
                <textarea value={d.description} onChange={(e) => set('description', e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Add photos of your vehicle. The first photo is the cover guests see in search.
                </p>
                <p className={`mt-1 text-sm font-medium ${d.photos.length >= minPhotos ? 'text-success' : 'text-warning'}`}>
                  {d.photos.length >= minPhotos
                    ? `${d.photos.length} photos added`
                    : `${d.photos.length} of ${minPhotos} required photos added`}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {d.photos.map((p, i) => (
                  <div key={i} className="group relative aspect-[4/3] overflow-hidden rounded-md border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={() => set('photos', d.photos.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Cover</span>}
                  </div>
                ))}
                <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
                  />
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                  <span className="text-xs">{uploading ? 'Uploading…' : 'Add photo'}</span>
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-medium">Smart Price AI</span>
                    {smartPrice.data && (
                      <span className="text-muted-foreground">
                        Market median ${(smartPrice.data.median / 100).toFixed(0)} · {smartPrice.data.demand} demand · {smartPrice.data.sampleSize} comps
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" loading={smartPrice.isPending} onClick={() => smartPrice.mutate()}>
                    {smartPrice.data ? `Apply $${(smartPrice.data.suggested / 100).toFixed(0)}` : 'Suggest a price'}
                  </Button>
                </div>
              </div>
              <Field label="Daily price ($)"><Input type="number" value={d.dailyPrice} onChange={(e) => set('dailyPrice', Number(e.target.value))} /></Field>
              <Field label="Cleaning fee ($)"><Input type="number" value={d.cleaningFee} onChange={(e) => set('cleaningFee', Number(e.target.value))} /></Field>
              <Field label="Weekend premium (%)"><Input type="number" value={d.weekendPct} onChange={(e) => set('weekendPct', Number(e.target.value))} /></Field>
              <Field label="Weekly discount (%)"><Input type="number" value={d.weeklyDiscountPct} onChange={(e) => set('weeklyDiscountPct', Number(e.target.value))} /></Field>
              <Field label="Monthly discount (%)"><Input type="number" value={d.monthlyDiscountPct} onChange={(e) => set('monthlyDiscountPct', Number(e.target.value))} /></Field>
              <Field label="Early-bird discount (%)"><Input type="number" value={d.earlyBirdPct} onChange={(e) => set('earlyBirdPct', Number(e.target.value))} /></Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={d.instantBook} onChange={(e) => set('instantBook', e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                Enable instant booking (guests book without approval)
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Offer delivery to earn more. Set a flat delivery fee.</p>
              {(['airport', 'home', 'hotel', 'business'] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm capitalize">
                  <input type="checkbox" checked={d.delivery[k]} onChange={(e) => set('delivery', { ...d.delivery, [k]: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                  {k} delivery
                </label>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Delivery radius (km)"><Input type="number" value={d.delivery.radiusKm} onChange={(e) => set('delivery', { ...d.delivery, radiusKm: Number(e.target.value) })} /></Field>
                <Field label="Delivery fee ($)"><Input type="number" value={d.delivery.fee} onChange={(e) => set('delivery', { ...d.delivery, fee: Number(e.target.value) })} /></Field>
              </div>

              <div className="border-t border-border pt-3">
                <p className="mb-2 text-sm font-medium">Extras you offer</p>
                <div className="space-y-1.5">
                  {Object.entries(ADDON_PRESETS).map(([code, a]) => (
                    <label key={code} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={d.addOnCodes.includes(code)}
                          onChange={() => set('addOnCodes', d.addOnCodes.includes(code) ? d.addOnCodes.filter((c) => c !== code) : [...d.addOnCodes, code])}
                          className="h-4 w-4 accent-[hsl(var(--primary))]"
                        />
                        {a.label}
                      </span>
                      <span className="text-muted-foreground">${a.amount}{a.priceType === 'per_day' ? '/day' : '/trip'}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
                <Field label="Mileage limit (km/day, 0 = unlimited)"><Input type="number" value={d.mileagePerDay} onChange={(e) => set('mileagePerDay', Number(e.target.value))} /></Field>
                <Field label="Overage fee ($/km)"><Input type="number" step="0.01" value={d.mileageOverage} onChange={(e) => set('mileageOverage', Number(e.target.value))} /></Field>
                <Field label="Trip rules (one per line)" className="sm:col-span-2">
                  <textarea value={d.tripRules} onChange={(e) => set('tripRules', e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="No smoking&#10;Pets allowed with deposit" />
                </Field>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-2 text-sm">
              <Row label="Vehicle" value={`${d.make} ${d.model} ${d.year}`} />
              <Row label="Category" value={d.category} />
              <Row label="Location" value={`${d.address || '—'}, ${d.city}`} />
              <Row label="Photos" value={`${d.photos.length}`} />
              <Row label="Daily price" value={`$${d.dailyPrice}`} />
              <Row label="Instant book" value={d.instantBook ? 'Yes' : 'No'} />
              {create.isError && (
                <p className="text-destructive">
                  {create.error instanceof ApiError ? create.error.message : 'Failed to create listing'}
                </p>
              )}
              <p className="pt-2 text-muted-foreground">
                Your listing will be created as a draft. Submit it for verification to go live.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Create listing
          </Button>
        )}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize">
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </Field>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
