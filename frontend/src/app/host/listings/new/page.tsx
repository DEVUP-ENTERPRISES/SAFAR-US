'use client';

import { IMAGE_ACCEPT } from '@/lib/upload-formats';
import { useEffect, useRef, useState } from 'react';
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
import { hostApi, type RowPreview } from '@/features/host/api';
import { useToast } from '@/components/ui/toast';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LocationSearch } from '@/features/maps/components/location-search';
import { ColorPicker } from '@/features/vehicles/components/color-picker';
import { FeaturePicker } from '@/features/vehicles/components/feature-picker';
import { US_STATES } from '@/lib/data/us-states';
import { milesToKm, perMileToPerKm } from '@/lib/utils/format';
import { readListingDraft, saveListingDraft, clearListingDraft } from '@/features/vehicles/listing-draft';
import { ShieldCheck } from 'lucide-react';
import { DeliveryLocationsEditor } from '@/features/vehicles/components/delivery-locations-editor';
import type { DeliveryLocation } from '@/features/vehicles/types';

const STEPS = ['Basics', 'Details', 'Photos', 'Pricing', 'Delivery', 'Standards', 'Review'];

/** SHA-256 of the file's bytes — identifies the same photo under any filename. */
async function fingerprintFile(file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Non-secure context — fall back to a weaker but still useful identity.
    return `${file.name}:${file.size}:${file.lastModified}`;
  }
}

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
  address: string;      // geocoded, from the location picker
  pickupNotes: string;  // host's free text: gate codes, which bay, etc.
  lng: number | null;
  lat: number | null;
  color: string;
  doors: number;
  features: string[];
  vin: string;
  licensePlate: string;
  licensePlateState: string;
  odometerMiles: number | '';
  standardsAgreed: boolean;
  photos: { url: string; key?: string; isCover?: boolean; fingerprint?: string }[];
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
  deliveryLocations: DeliveryLocation[];
  addOnCodes: string[];
  tripRules: string;
  mileagePerDay: number;
  mileageOverage: number;
}

// Preset extras a host can offer (guest selects at checkout).
const ADDON_PRESETS: Record<string, { label: string; priceType: 'per_trip' | 'per_day'; amount: number; note?: string }> = {
  child_seat: { label: 'Child seat', priceType: 'per_trip', amount: 15 },
  additional_driver: { label: 'Additional driver', priceType: 'per_day', amount: 10 },
  // $8/gallon on a typical 15-gallon refill, plus a $20 service fee.
  fuel_surcharge: {
    label: 'Fuel surcharge',
    priceType: 'per_trip',
    amount: 140,
    note: '$8/gallon + $20 service fee — guest returns it unfuelled',
  },
};

const initial: Draft = {
  make: '', model: '', year: 2022, category: 'economy', bodyType: 'sedan',
  transmission: 'automatic', fuelType: 'petrol', seats: 5,
  city: '', address: '', pickupNotes: '', lng: null, lat: null, color: '', doors: 4, features: [],
  vin: '', licensePlate: '', licensePlateState: '', odometerMiles: '', standardsAgreed: false,
  photos: [], title: '', description: '', instantBook: true, cancellationPolicy: 'moderate',
  dailyPrice: 65, cleaningFee: 25, weekendPct: 20, weeklyDiscountPct: 10, monthlyDiscountPct: 20,
  earlyBirdPct: 5, lastMinutePct: 0,
  deliveryLocations: [],
  addOnCodes: [], tripRules: '', mileagePerDay: 200, mileageOverage: 0.35,
};

export default function NewListingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const notify = useToast();
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  // Restore whatever was in progress — refresh, back button, or a closed tab.
  // Runs once, before the first save effect can overwrite it.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = readListingDraft<Draft>();
    if (saved) {
      setD({ ...initial, ...saved.draft });
      setStep(saved.step);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveListingDraft(d, step);
  }, [d, step, restored]);

  // Continue/Back leaves the scroll position wherever it was on the previous
  // step — the new step then renders starting mid-screen, under the navbar,
  // instead of from its own top. Skip on the initial mount (restoring a draft
  // mid-wizard should not yank the screen before the host has scrolled at all).
  const stepMounted = useRef(false);
  useEffect(() => {
    if (!restored) return;
    if (!stepMounted.current) {
      stepMounted.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, restored]);

  // The server owns the photo minimum; the wizard must not disagree with it.
  const reqs = useQuery({ queryKey: ['listing-requirements'], queryFn: () => vehicleApi.requirements() });
  const minPhotos = reqs.data?.minPhotos ?? 4;
  /** Included mileage is capped at 4 miles per dollar of daily rate. */
  const mileageCap = Math.max(1, Math.round(Number(d.dailyPrice) * 4));

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
      // Same picture twice is always a mistake, and it costs a listing slot.
      // Fingerprint the bytes, not the filename — the same photo re-saved from
      // a phone gallery comes back with a different name every time.
      const incoming = Array.from(files);
      const fingerprints = await Promise.all(incoming.map(fingerprintFile));
      const seen = new Set(d.photos.map((p) => p.fingerprint).filter(Boolean) as string[]);
      const list: File[] = [];
      // Keyed by File, not by index — the upload batches below are grouped by
      // content type, so positional order does not survive a mixed selection.
      const fpOf = new Map<File, string>();
      let duplicates = 0;
      incoming.forEach((f, i) => {
        const fp = fingerprints[i];
        if (seen.has(fp)) {
          duplicates += 1;
          return;
        }
        seen.add(fp);
        list.push(f);
        fpOf.set(f, fp);
      });
      if (duplicates > 0) {
        notify({
          tone: 'error',
          title: `${duplicates} photo${duplicates === 1 ? ' was' : 's were'} already added`,
          description: 'Skipped the duplicates — pick different shots of the car.',
        });
      }
      if (!list.length) return;
      // Presign per content type: signing every file with list[0].type meant
      // a mixed JPEG/PNG selection uploaded the later files under the wrong
      // type, which storage can reject outright.
      const byType = new Map<string, File[]>();
      for (const f of list) {
        const t = f.type || 'image/jpeg';
        byType.set(t, [...(byType.get(t) ?? []), f]);
      }
      const groups = await Promise.all(
        Array.from(byType.entries()).map(async ([type, files]) => ({
          files,
          targets: await hostApi.uploadUrls('vehicle_photo', files.length, type),
        })),
      );
      const pairs = groups.flatMap((g) => g.files.map((f, i) => ({ file: f, target: g.targets[i] })));
      await Promise.all(
        pairs.map(async ({ file: f, target }) => {
          const res = await fetch(target.uploadUrl, {
            method: 'PUT',
            body: f,
            headers: { 'Content-Type': f.type || 'application/octet-stream' },
          });
          // fetch resolves on 4xx/5xx — without this a rejected upload would be
          // recorded as a photo.
          if (!res.ok) throw new Error(`Storage rejected the upload (${res.status}).`);
        }),
      );
      setD((prev) => {
        const added = pairs.map(({ file: f, target: t }) => ({
          url: t.publicUrl,
          key: t.key,
          isCover: false,
          fingerprint: fpOf.get(f),
        }));
        const photos = [...prev.photos, ...added];
        // Something must be the cover; the first photo ever added is a better
        // default than none at all.
        if (photos.length && !photos.some((x) => x.isCover)) photos[0] = { ...photos[0], isCover: true };
        return { ...prev, photos };
      });
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

  const [vinResult, setVinResult] = useState<RowPreview | null>(null);
  const vinDecode = useMutation({
    mutationFn: (vin: string) => hostApi.importPreview([vin]),
    onSuccess: ([r]) => {
      setVinResult(r);
      if (!r.ok) return;
      setD((prev) => ({
        ...prev,
        make: r.make ?? prev.make,
        model: r.model ?? prev.model,
        year: r.year ?? prev.year,
        bodyType: r.bodyType ?? prev.bodyType,
        fuelType: r.fuelType ?? prev.fuelType,
        transmission: r.transmission ?? prev.transmission,
        seats: r.seats ?? prev.seats,
        doors: r.doors ?? prev.doors,
      }));
    },
  });

  const create = useMutation({
    mutationFn: () => {
      const body: CreateVehicleInput = {
        make: d.make, model: d.model, year: Number(d.year), bodyType: d.bodyType, category: d.category,
        transmission: d.transmission, fuelType: d.fuelType, seats: Number(d.seats),
        vin: d.vin.trim() || undefined,
        registrationNumber:
          d.licensePlate.trim()
            ? `${d.licensePlate.trim()}${d.licensePlateState ? ` (${d.licensePlateState})` : ''}`
            : undefined,
        specs: {
          color: d.color,
          doors: Number(d.doors),
          ...(d.odometerMiles !== '' ? { mileageKm: milesToKm(Number(d.odometerMiles)) } : {}),
        },
        features: d.features,
        photos: d.photos,
        location: {
          lng: d.lng!,
          lat: d.lat!,
          address: [d.address, d.pickupNotes].filter(Boolean).join(' — '),
          city: d.city,
        },
        listing: {
          title: d.title || `${d.make} ${d.model} ${d.year}`,
          description: d.description,
          instantBook: d.instantBook,
          minTripHours: 24,
          maxTripHours: 24 * 30,
          cancellationPolicy: d.cancellationPolicy,
          deliveryLocations: d.deliveryLocations,
        },
        addOns: d.addOnCodes.map((code) => ({
          code,
          label: ADDON_PRESETS[code].label,
          priceType: ADDON_PRESETS[code].priceType,
          amount: Math.round(ADDON_PRESETS[code].amount * 100),
        })),
        tripRules: d.tripRules.split('\n').map((r) => r.trim()).filter(Boolean),
        // The host types miles; storage stays in km.
        mileageLimit: {
          perDayKm: milesToKm(Number(d.mileagePerDay)),
          overageFeePerKm: perMileToPerKm(Math.round(d.mileageOverage * 100)),
        },
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
    onSuccess: (v) => { clearListingDraft(); router.push(`/host/listings/${v._id}`); },
  });

  /**
   * What each step requires, named per field.
   *
   * The wizard used to gate only make/model and photo count, so a host could
   * reach Review without ever picking a location and the create call came back
   * with a bare "Validation failed" — no indication of which field, six steps
   * from where the mistake was made. Requirements are checked on the step that
   * owns them and the offending input is marked there.
   */
  const stepErrors = (forStep: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (forStep === 0) {
      if (!d.make.trim()) e.make = 'Required';
      if (!d.model.trim()) e.model = 'Required';
      const year = Number(d.year);
      if (!year || year < 1900 || year > new Date().getFullYear() + 1) e.year = 'Enter a valid year';
      if (!Number(d.seats) || Number(d.seats) < 1) e.seats = 'At least 1 seat';
    }
    if (forStep === 1) {
      // A listing with no coordinates cannot be searched, so this is the one
      // field a host must not be able to skip past.
      if (d.lng === null || d.lat === null) e.location = 'Pick a pickup location from the suggestions';
      else if (!d.city.trim()) e.location = 'That address has no city — pick a more specific one';
    }
    if (forStep === 2) {
      if (d.photos.length < minPhotos) {
        e.photos = `Add ${minPhotos - d.photos.length} more photo${minPhotos - d.photos.length === 1 ? '' : 's'}`;
      }
    }
    if (forStep === 3) {
      if (!Number(d.dailyPrice) || Number(d.dailyPrice) <= 0) e.dailyPrice = 'Set a daily price';
      if (Number(d.cleaningFee) < 0) e.cleaningFee = 'Cannot be negative';
    }
    if (forStep === 4) {
      // Unlimited mileage isn't offered, and the included allowance is capped
      // against the daily rate — 4 miles per dollar per day.
      if (!Number(d.mileagePerDay) || Number(d.mileagePerDay) < 1) {
        e.mileagePerDay = 'Set a daily mileage limit — unlimited is not allowed';
      } else if (Number(d.mileagePerDay) > mileageCap) {
        e.mileagePerDay = `Max ${mileageCap} miles/day for a $${d.dailyPrice}/day car`;
      }
    }
    if (forStep === 5) {
      if (!d.standardsAgreed) e.standardsAgreed = 'You must agree to continue';
    }
    return e;
  };

  const errors = stepErrors(step);
  const canNext = () => Object.keys(errors).length === 0;

  /** Every unmet requirement across the whole wizard — shown on Review. */
  const allBlockers = [0, 1, 2, 3, 4, 5].flatMap((i) =>
    Object.entries(stepErrors(i)).map(([field, msg]) => ({ step: i, field, msg })),
  );

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
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <Field label="VIN" hint="Enter it first — we'll fill in make, model, year and the rest from it.">
                  <div className="flex gap-2">
                    <Input
                      value={d.vin}
                      onChange={(e) => { set('vin', e.target.value.toUpperCase()); setVinResult(null); }}
                      placeholder="1GNERFKWXPJ24O667"
                      maxLength={17}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={d.vin.trim().length < 11}
                      loading={vinDecode.isPending}
                      onClick={() => vinDecode.mutate(d.vin.trim())}
                    >
                      Decode
                    </Button>
                  </div>
                </Field>
                {vinResult?.ok && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-success">
                    <Check className="h-4 w-4" /> {vinResult.year} {vinResult.make} {vinResult.model}
                    {vinResult.trim ? ` ${vinResult.trim}` : ''} — details filled in below.
                    {vinResult.missing.length > 0 && ` Check ${vinResult.missing.join(', ')} — the VIN didn't include it.`}
                  </p>
                )}
                {vinResult?.duplicate && (
                  <p className="mt-2 text-sm text-destructive">This VIN is already on one of your listings.</p>
                )}
                {vinResult && !vinResult.ok && (
                  <p className="mt-2 text-sm text-destructive">{vinResult.error ?? "Couldn't decode that VIN — enter the details below manually."}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Make *" error={errors.make}><Input value={d.make} onChange={(e) => set('make', e.target.value)} placeholder="Toyota" /></Field>
                <Field label="Model *" error={errors.model}><Input value={d.model} onChange={(e) => set('model', e.target.value)} placeholder="Camry" /></Field>
                <Field label="Year *" error={errors.year}><Input type="number" value={d.year} onChange={(e) => set('year', Number(e.target.value))} /></Field>
                <Field label="Seats *" error={errors.seats}><Input type="number" value={d.seats} onChange={(e) => set('seats', Number(e.target.value))} /></Field>
                <Field label="Doors"><Input type="number" value={d.doors} onChange={(e) => set('doors', Number(e.target.value))} /></Field>
                <SelectField label="Category" value={d.category} onChange={(v) => set('category', v)} options={['economy', 'luxury', 'suv', 'van', 'sports', 'ev']} />
                <SelectField label="Body type" value={d.bodyType} onChange={(v) => set('bodyType', v)} options={['sedan', 'suv', 'hatchback', 'coupe', 'van', 'truck']} />
                <SelectField label="Transmission" value={d.transmission} onChange={(v) => set('transmission', v as Draft['transmission'])} options={['automatic', 'manual']} />
                <SelectField
                  label="Fuel"
                  value={d.fuelType}
                  onChange={(v) => set('fuelType', v as Draft['fuelType'])}
                  options={[
                    { value: 'petrol', label: 'Gas' },
                    { value: 'diesel', label: 'Diesel' },
                    { value: 'hybrid', label: 'Hybrid' },
                    { value: 'ev', label: 'Electric' },
                  ]}
                />
                <Field label="Odometer (miles)" hint="Optional">
                  <Input type="number" value={d.odometerMiles} onChange={(e) => set('odometerMiles', e.target.value === '' ? '' : Number(e.target.value))} />
                </Field>
                <Field label="License plate number">
                  <Input value={d.licensePlate} onChange={(e) => set('licensePlate', e.target.value.toUpperCase())} placeholder="XCW2O63" />
                </Field>
                <SelectField
                  label="State"
                  value={d.licensePlateState}
                  onChange={(v) => set('licensePlateState', v)}
                  options={[{ value: '', label: 'Select a state' }, ...US_STATES.map((s) => ({ value: s, label: s }))]}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Where guests pick it up *"
                className="sm:col-span-2"
                error={errors.location}
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
                <Input value={d.pickupNotes} onChange={(e) => set('pickupNotes', e.target.value)} placeholder="Garage level 2, spot 14" />
              </Field>
              <Field label="Color" hint="Guests filter by this, so pick the closest match">
                <ColorPicker value={d.color} onChange={(v) => set('color', v)} />
              </Field>
              <Field label="Listing title" className="sm:col-span-2"><Input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder={`${d.make} ${d.model} ${d.year}`} /></Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea value={d.description} onChange={(e) => set('description', e.target.value)} rows={3} />
              </Field>
              <Field label="Features" className="sm:col-span-2" hint="Guests filter by these — pick everything that applies">
                <FeaturePicker value={d.features} onChange={(v) => set('features', v)} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Add photos of your vehicle. Select several at once. Tap any photo to make it the cover
                  guests see in search.
                </p>
                <p className={`mt-1 text-sm font-medium ${d.photos.length >= minPhotos ? 'text-success' : 'text-destructive'}`}>
                  {d.photos.length >= minPhotos
                    ? `${d.photos.length} photos added`
                    : `${d.photos.length} of ${minPhotos} required photos added — ${errors.photos}`}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {d.photos.map((p, i) => {
                  // Cover is explicit now. It used to be "whichever is first",
                  // which a host could not change without deleting and
                  // re-uploading in a different order.
                  const isCover = p.isCover ?? (!d.photos.some((x) => x.isCover) && i === 0);
                  return (
                    <div
                      key={p.key ?? i}
                      className={cn(
                        'group relative aspect-[4/3] overflow-hidden rounded-md border-2 transition-colors',
                        isCover ? 'border-primary' : 'border-border',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-full w-full object-cover" />

                      {/* The whole tile is the target — a small icon is a poor
                          touch target on a phone, which is where hosts list. */}
                      {!isCover && (
                        <button
                          type="button"
                          aria-label="Make this the cover photo"
                          onClick={() => set('photos', d.photos.map((x, j) => ({ ...x, isCover: j === i })))}
                          className="absolute inset-0 flex items-end justify-center bg-black/0 pb-2 opacity-0 transition-all hover:bg-black/35 hover:opacity-100 focus-visible:bg-black/35 focus-visible:opacity-100"
                        >
                          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-foreground">
                            Make cover
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => {
                          const next = d.photos.filter((_, j) => j !== i);
                          // Removing the cover must promote another, or the
                          // listing silently loses its cover image.
                          if (isCover && next.length) next[0] = { ...next[0], isCover: true };
                          set('photos', next);
                        }}
                        className="absolute end-1 top-1 z-10 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>

                      {isCover && (
                        <span className="pointer-events-none absolute bottom-1 start-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          Cover
                        </span>
                      )}
                    </div>
                  );
                })}
                <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
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
              <Field label="Daily price ($) *" error={errors.dailyPrice}><Input type="number" value={d.dailyPrice} onChange={(e) => set('dailyPrice', Number(e.target.value))} /></Field>
              <Field label="Cleaning fee ($)" error={errors.cleaningFee}><Input type="number" value={d.cleaningFee} onChange={(e) => set('cleaningFee', Number(e.target.value))} /></Field>
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
              <p className="text-sm text-muted-foreground">Offer delivery to earn more — each location can have its own fee.</p>
              <DeliveryLocationsEditor
                value={d.deliveryLocations}
                onChange={(next) => set('deliveryLocations', next)}
                home={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng, address: d.address, city: d.city } : undefined}
              />

              <div className="border-t border-border pt-3">
                <p className="mb-2 text-sm font-medium">Extras you offer</p>
                <div className="space-y-1.5">
                  {Object.entries(ADDON_PRESETS).map(([code, a]) => (
                    <label key={code} className="flex items-start justify-between gap-2 text-sm">
                      <span className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={d.addOnCodes.includes(code)}
                          onChange={() => set('addOnCodes', d.addOnCodes.includes(code) ? d.addOnCodes.filter((c) => c !== code) : [...d.addOnCodes, code])}
                          className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                        />
                        <span>
                          {a.label}
                          {a.note && <span className="block text-xs text-muted-foreground">{a.note}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">${a.amount}{a.priceType === 'per_day' ? '/day' : '/trip'}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
                <Field
                  label="Daily mileage limit (miles)"
                  error={errors.mileagePerDay}
                  hint={`Unlimited isn't allowed. The cap for a $${d.dailyPrice}/day car is ${mileageCap} miles/day.`}
                >
                  <Input
                    type="number"
                    min={1}
                    max={mileageCap}
                    value={d.mileagePerDay}
                    onChange={(e) => set('mileagePerDay', Number(e.target.value))}
                  />
                </Field>
                <Field label="Overage fee ($/mile)"><Input type="number" step="0.01" value={d.mileageOverage} onChange={(e) => set('mileageOverage', Number(e.target.value))} /></Field>
                <Field label="Trip rules (one per line)" className="sm:col-span-2">
                  <Textarea value={d.tripRules} onChange={(e) => set('tripRules', e.target.value)} rows={3} placeholder="No smoking&#10;No off-road driving" />
                </Field>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-7 w-7" />
                </span>
                <h2 className="display text-xl">Safety &amp; quality standards</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  We strive to maintain a safe marketplace and reliable experience. As a host, you&apos;re
                  expected to uphold these standards:
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="font-semibold">Maintenance</p>
                  <p className="text-sm text-muted-foreground">
                    Keep your car well maintained so your guests stay safe on the road. You will be required
                    to pass an inspection for every car you list.
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Cleaning</p>
                  <p className="text-sm text-muted-foreground">
                    Clean and refuel your car before every trip so your guests have a good experience.
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Accurate details</p>
                  <p className="text-sm text-muted-foreground">
                    The photos, features and condition you list must match the car a guest actually picks up.
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Availability</p>
                  <p className="text-sm text-muted-foreground">
                    Honor every confirmed booking. Cancelling on a guest after they&apos;ve booked affects your
                    standing as a host.
                  </p>
                </div>
              </div>
              <label className="flex items-start gap-2.5 rounded-xl border border-border/60 p-3.5 text-sm">
                <input
                  type="checkbox"
                  checked={d.standardsAgreed}
                  onChange={(e) => set('standardsAgreed', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                />
                I agree to uphold CatoDrive&apos;s safety and quality standards for every trip.
              </label>
              {errors.standardsAgreed && <p className="text-sm text-destructive">{errors.standardsAgreed}</p>}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-2 text-sm">
              <Row label="Vehicle" value={`${d.make} ${d.model} ${d.year}`} />
              <Row label="Category" value={d.category} />
              <Row label="Location" value={d.city ? `${d.address || d.city} · ${d.city}` : 'Not set'} />
              <Row label="Photos" value={`${d.photos.length}`} />
              <Row label="License plate" value={d.licensePlate ? `${d.licensePlate}${d.licensePlateState ? ` (${d.licensePlateState})` : ''}` : 'Not set'} />
              <Row label="VIN" value={d.vin || 'Not set'} />
              <Row label="Daily price" value={`$${d.dailyPrice}`} />
              <Row label="Instant book" value={d.instantBook ? 'Yes' : 'No'} />
              {/* Anything still missing, with a link back to the step that owns it. */}
              {allBlockers.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="font-semibold text-destructive">
                    {allBlockers.length} thing{allBlockers.length === 1 ? '' : 's'} still needed
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {allBlockers.map((b) => (
                      <li key={`${b.step}-${b.field}`}>
                        <button
                          onClick={() => setStep(b.step)}
                          className="text-start text-destructive hover:underline"
                        >
                          {STEPS[b.step]}: {b.msg}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* The server's own rejection, field by field. It returns a details
                  list; showing only `message` reduced every failure to the
                  useless "Validation failed". */}
              {create.isError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="font-semibold text-destructive">
                    {create.error instanceof ApiError ? create.error.message : 'Failed to create listing'}
                  </p>
                  {create.error instanceof ApiError && !!create.error.details?.length && (
                    <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-destructive">
                      {create.error.details.map((det, i) => (
                        <li key={i}>
                          {det.field ? <span className="font-mono">{det.field}</span> : null}
                          {det.field ? ' — ' : ''}
                          {det.issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
          <Button
            loading={create.isPending}
            disabled={allBlockers.length > 0}
            onClick={() => create.mutate()}
          >
            Create listing
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Options may be plain strings or {value,label} pairs — needed because the
 * stored value and the word a host reads are not always the same. "petrol"
 * is stored, but a US host is looking for "Gas".
 */
type Opt = string | { value: string; label: string };

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Opt[] }) {
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {norm.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
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
