'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Camera, Check, CheckCircle2, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { uploadFiles } from '@/features/media/upload';
import { assetPartnerApi, type PartnerApplicationDetail, type PortalApplicationInput, type VinLookup } from '@/features/asset-partners/api';
import { US_STATES } from '@/lib/data/us-states';
import { ApiError } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';

type YN = 'yes' | 'no' | '';
type PartnerType = 'individual' | 'business' | 'fleet';
type Ownership = 'owned' | 'financed' | 'leased';
type Coverage = 'full' | 'liability' | 'unsure';
type Availability = 'fulltime' | 'parttime' | 'seasonal';
type Photo = { url: string; key?: string };

interface Draft {
  fullName: string; phone: string; partnerType: PartnerType | ''; businessName: string;
  address: string; city: string; state: string; zip: string;
  vin: string; year: string; make: string; model: string; trim: string; mileage: string; plate: string;
  ownership: Ownership | ''; lienholder: string; photos: Record<string, Photo>;
  accident: YN; accidentDetail: string; smokeFree: YN; petFree: YN;
  carrier: string; policyNumber: string; coverage: Coverage | '';
  availability: Availability | ''; notes: string; confirmed: boolean;
}

const BLANK: Draft = {
  fullName: '', phone: '', partnerType: '', businessName: '', address: '', city: '', state: 'TX', zip: '',
  vin: '', year: '', make: '', model: '', trim: '', mileage: '', plate: '', ownership: '', lienholder: '', photos: {},
  accident: '', accidentDetail: '', smokeFree: '', petFree: '', carrier: '', policyNumber: '', coverage: '',
  availability: '', notes: '', confirmed: false,
};

const PHOTOS = [
  { slot: 'Front', required: true, hint: 'Front three-quarter view' },
  { slot: 'Odometer', required: true, hint: 'Dashboard showing the mileage' },
  { slot: 'Rear', required: false, hint: 'Rear three-quarter view' },
  { slot: 'Interior', required: false, hint: 'Front seats and dashboard' },
] as const;

const STEPS = { you: 'About you', car: 'Your car', condition: 'Condition & insurance', confirm: 'Confirm' } as const;
type Step = keyof typeof STEPS;

function fromApplication(a: PartnerApplicationDetail, withCar: boolean): Draft {
  const yn = (b?: boolean): YN => (b === undefined ? '' : b ? 'yes' : 'no');
  const person = {
    ...BLANK,
    fullName: a.fullName, phone: a.phone ?? '', partnerType: a.partnerType, businessName: a.businessName ?? '',
    address: a.address, city: a.city, state: a.state, zip: a.zip,
  };
  if (!withCar) return person;
  return {
    ...person,
    vin: a.vehicle.vin, year: a.vehicle.year, make: a.vehicle.make, model: a.vehicle.model, trim: a.vehicle.trim ?? '',
    mileage: String(a.vehicle.mileage), plate: a.vehicle.plate, ownership: a.ownership, lienholder: a.lienholder ?? '',
    photos: Object.fromEntries(a.photos.map((p) => [p.label ?? 'Photo', { url: p.url, key: p.key }])),
    accident: yn(a.hadAccident), accidentDetail: a.accidentDetail ?? '', smokeFree: yn(a.smokeFree), petFree: yn(a.petFree),
    carrier: a.insurance.carrier, policyNumber: a.insurance.policyNumber, coverage: a.insurance.coverageType,
    availability: a.availability, notes: a.notes ?? '',
  };
}

function toInput(d: Draft): PortalApplicationInput {
  const opt = (v: string) => v.trim() || undefined;
  return {
    fullName: d.fullName.trim(),
    businessName: d.partnerType === 'individual' ? undefined : opt(d.businessName),
    partnerType: d.partnerType as PartnerType,
    phone: d.phone,
    address: d.address.trim(), city: d.city.trim(), state: d.state, zip: d.zip.trim(),
    vehicle: { year: d.year.trim(), make: d.make.trim(), model: d.model.trim(), trim: opt(d.trim), mileage: Number(d.mileage), vin: d.vin.trim().toUpperCase(), plate: d.plate.trim().toUpperCase() },
    ownership: d.ownership as Ownership,
    lienholder: d.ownership === 'owned' ? undefined : opt(d.lienholder),
    accident: d.accident as 'yes' | 'no',
    accidentDetail: d.accident === 'yes' ? opt(d.accidentDetail) : undefined,
    smokeFree: d.smokeFree as 'yes' | 'no',
    petFree: d.petFree as 'yes' | 'no',
    photos: Object.entries(d.photos).map(([label, p]) => ({ url: p.url, key: p.key, label })),
    insurance: { carrier: d.carrier.trim(), policyNumber: d.policyNumber.trim(), coverageType: d.coverage as Coverage },
    availability: d.availability as Availability,
    notes: opt(d.notes),
    acknowledgedAccurate: true,
    acknowledgedInspection: true,
    acknowledgedTerms: true,
    signature: d.fullName.trim(),
    signDate: new Date().toISOString(),
  };
}

function errorsFor(step: Step, d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  const need = (k: keyof Draft, msg = 'Required') => { if (!String(d[k] ?? '').trim()) e[k] = msg; };
  if (step === 'you') {
    need('fullName'); need('partnerType', 'Choose one');
    if (d.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid phone number';
    if (d.partnerType && d.partnerType !== 'individual') need('businessName');
    need('address'); need('city'); need('state');
    if (!/^\d{5}(-\d{4})?$/.test(d.zip.trim())) e.zip = 'Enter a 5-digit ZIP';
  }
  if (step === 'car') {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(d.vin.trim())) e.vin = 'Enter the 17-character VIN';
    if (!/^\d{4}$/.test(d.year.trim())) e.year = 'Enter a 4-digit year';
    need('make'); need('model'); need('plate');
    const miles = Number(d.mileage);
    if (!d.mileage.trim() || !Number.isInteger(miles) || miles < 0 || miles > 500_000) e.mileage = 'Enter the mileage';
    need('ownership', 'Choose one');
    if (d.ownership && d.ownership !== 'owned') need('lienholder', 'Who holds the loan or lease?');
    for (const p of PHOTOS) if (p.required && !d.photos[p.slot]) e[`photo-${p.slot}`] = 'Add this photo';
  }
  if (step === 'condition') {
    need('accident', 'Choose one'); need('smokeFree', 'Choose one'); need('petFree', 'Choose one');
    if (d.accident === 'yes') need('accidentDetail', 'Tell us briefly what happened');
    need('carrier'); need('policyNumber'); need('coverage', 'Choose one');
  }
  if (step === 'confirm') {
    need('availability', 'Choose one');
    if (!d.confirmed) e.confirmed = 'Please confirm to continue';
  }
  return e;
}

function Choice<T extends string>({ value, options, onChange }: { value: T | ''; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o.value} type="button" active={value === o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

const YES_NO = [{ value: 'yes' as const, label: 'Yes' }, { value: 'no' as const, label: 'No' }];

export interface ApplicationFormProps {
  /** New partner, or another car from a partner already in the programme. */
  mode: 'partner' | 'vehicle';
  /** An application to correct, or the partner's last one to copy their details from. */
  initial?: PartnerApplicationDetail;
  /** CatoDrive's note when it sent the application back. */
  reviewNote?: string;
  draftKey: string;
  submitLabel?: string;
  onSubmit: (input: PortalApplicationInput) => Promise<unknown>;
}

export function ApplicationForm({ mode, initial, reviewNote, draftKey, submitLabel = 'Send for review', onSubmit }: ApplicationFormProps) {
  // Another car skips "About you" when we already have their details from an earlier application.
  const steps: Step[] = mode === 'vehicle' && initial ? ['car', 'condition', 'confirm'] : ['you', 'car', 'condition', 'confirm'];
  const [d, setD] = useState<Draft>(() => {
    const seeded = initial ? fromApplication(initial, mode === 'partner' || !!reviewNote) : BLANK;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved && !reviewNote) return { ...seeded, ...(JSON.parse(saved) as Partial<Draft>), confirmed: false };
    } catch { /* storage unavailable: start from the seed */ }
    return seeded;
  });
  const [stepIdx, setStepIdx] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [vin, setVin] = useState<{ state: 'idle' | 'loading' | 'done' | 'failed'; result?: VinLookup }>({ state: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const top = useRef<HTMLDivElement>(null);
  const step = steps[stepIdx];

  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify({ ...d, confirmed: false })); } catch { /* storage unavailable */ }
  }, [d, draftKey]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => (prev[k] ? Object.fromEntries(Object.entries(prev).filter(([key]) => key !== k)) : prev));
  };

  const lookupVin = async (raw: string) => {
    const clean = raw.trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(clean)) return;
    setVin({ state: 'loading' });
    try {
      const result = await assetPartnerApi.lookupVin(clean);
      setVin({ state: 'done', result });
      const car = result.decoded;
      if (car) {
        setD((prev) => ({
          ...prev,
          year: car.year ? String(car.year) : prev.year,
          make: car.make ?? prev.make,
          model: car.model ?? prev.model,
          trim: car.trim ?? prev.trim,
        }));
        setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !['year', 'make', 'model'].includes(k))));
      }
    } catch {
      setVin({ state: 'failed' });
    }
  };

  const addPhoto = async (slot: string, file?: File) => {
    if (!file) return;
    setUploading((u) => ({ ...u, [slot]: true }));
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== `photo-${slot}`)));
    try {
      const [up] = await uploadFiles('vehicle_photo', [file]);
      setD((prev) => ({ ...prev, photos: { ...prev.photos, [slot]: { url: up.url, key: up.key } } }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [`photo-${slot}`]: e instanceof Error && e.message.includes('JPG') ? 'Use a JPG, PNG or WebP photo' : 'That photo didn’t upload. Try again.' }));
    } finally {
      setUploading((u) => ({ ...u, [slot]: false }));
    }
  };

  const next = async () => {
    const e = errorsFor(step, d);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (stepIdx < steps.length - 1) {
      setStepIdx((i) => i + 1);
      top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit(toInput(d));
      try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'We couldn’t send it. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = Object.values(uploading).some(Boolean);

  return (
    <div ref={top} className="scroll-mt-24 space-y-5">
      {reviewNote && (
        <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div><p className="font-semibold">What CatoDrive needs you to change</p><p className="mt-1 text-muted-foreground">{reviewNote}</p></div>
        </div>
      )}

      <ol className="grid grid-cols-2 gap-2 sm:flex sm:gap-3" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className={cn('flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex-1', i === stepIdx ? 'border-primary bg-primary/10 text-primary' : i < stepIdx ? 'border-border text-foreground' : 'border-border text-muted-foreground')}>
            <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]', i < stepIdx ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              {i < stepIdx ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="truncate">{STEPS[s]}</span>
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          {step === 'you' && (
            <>
              <Section title="About you" hint="We use this for your agreement and payouts." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full legal name" htmlFor="fullName" error={errors.fullName}><Input id="fullName" autoComplete="name" value={d.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
                <Field label="Mobile number" htmlFor="phone" error={errors.phone}><PhoneInput id="phone" value={d.phone} onChange={(v) => set('phone', v)} /></Field>
              </div>
              <Field label="Joining as" error={errors.partnerType}>
                <Choice value={d.partnerType} onChange={(v) => set('partnerType', v)} options={[{ value: 'individual', label: 'Myself' }, { value: 'business', label: 'A business' }, { value: 'fleet', label: 'A small fleet' }]} />
              </Field>
              {d.partnerType && d.partnerType !== 'individual' && (
                <Field label="Business name" htmlFor="businessName" error={errors.businessName}><Input id="businessName" autoComplete="organization" value={d.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
              )}
              <Field label="Street address" htmlFor="address" error={errors.address}><Input id="address" autoComplete="street-address" value={d.address} onChange={(e) => set('address', e.target.value)} /></Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem_8rem]">
                <Field label="City" htmlFor="city" error={errors.city}><Input id="city" autoComplete="address-level2" value={d.city} onChange={(e) => set('city', e.target.value)} /></Field>
                <Field label="State" htmlFor="state" error={errors.state}>
                  <Select id="state" value={d.state} onChange={(e) => set('state', e.target.value)}>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
                </Field>
                <Field label="ZIP" htmlFor="zip" error={errors.zip}><Input id="zip" inputMode="numeric" autoComplete="postal-code" maxLength={10} value={d.zip} onChange={(e) => set('zip', e.target.value)} /></Field>
              </div>
            </>
          )}

          {step === 'car' && (
            <>
              <Section title="Your car" hint="Type the VIN and we fill in the rest. It’s on the driver-side dashboard and your registration." />
              <Field label="VIN" htmlFor="vin" error={errors.vin}>
                <div className="flex gap-2">
                  <Input id="vin" className="font-mono uppercase" maxLength={17} autoCapitalize="characters" spellCheck={false} value={d.vin}
                    onChange={(e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); set('vin', v); if (v.length === 17) void lookupVin(v); else setVin({ state: 'idle' }); }} />
                  <Button type="button" variant="outline" className="shrink-0" disabled={d.vin.length !== 17 || vin.state === 'loading'} onClick={() => void lookupVin(d.vin)} aria-label="Look up VIN">
                    {vin.state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </Field>
              {vin.state === 'done' && vin.result?.decoded && (
                <p className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success"><CheckCircle2 className="h-4 w-4 shrink-0" /> Found: {[vin.result.decoded.year, vin.result.decoded.make, vin.result.decoded.model, vin.result.decoded.trim].filter(Boolean).join(' ')}</p>
              )}
              {vin.state === 'done' && vin.result?.alreadyWithUs && (
                <p className="flex items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-warning" /> This car is already with CatoDrive. If that’s a mistake, add a note on the last step.</p>
              )}
              {(vin.state === 'failed' || (vin.state === 'done' && !vin.result?.decoded)) && (
                <p className="text-sm text-muted-foreground">We couldn’t read that VIN automatically. Fill in the details below.</p>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Year" htmlFor="year" error={errors.year}><Input id="year" inputMode="numeric" maxLength={4} value={d.year} onChange={(e) => set('year', e.target.value)} /></Field>
                <Field label="Make" htmlFor="make" error={errors.make}><Input id="make" value={d.make} onChange={(e) => set('make', e.target.value)} /></Field>
                <Field label="Model" htmlFor="model" error={errors.model}><Input id="model" value={d.model} onChange={(e) => set('model', e.target.value)} /></Field>
                <Field label="Trim" htmlFor="trim" hint="Optional"><Input id="trim" value={d.trim} onChange={(e) => set('trim', e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Mileage" htmlFor="mileage" error={errors.mileage}><Input id="mileage" inputMode="numeric" value={d.mileage} onChange={(e) => set('mileage', e.target.value.replace(/\D/g, ''))} /></Field>
                <Field label="License plate" htmlFor="plate" error={errors.plate}><Input id="plate" className="uppercase" maxLength={20} value={d.plate} onChange={(e) => set('plate', e.target.value)} /></Field>
              </div>
              <Field label="The car is" error={errors.ownership}>
                <Choice value={d.ownership} onChange={(v) => set('ownership', v)} options={[{ value: 'owned', label: 'Paid off' }, { value: 'financed', label: 'Financed' }, { value: 'leased', label: 'Leased' }]} />
              </Field>
              {d.ownership && d.ownership !== 'owned' && (
                <Field label={d.ownership === 'leased' ? 'Leasing company' : 'Lender'} htmlFor="lienholder" error={errors.lienholder}><Input id="lienholder" value={d.lienholder} onChange={(e) => set('lienholder', e.target.value)} /></Field>
              )}
              <div>
                <p className="text-sm font-medium">Photos</p>
                <p className="text-xs text-muted-foreground">Two are needed now; we take full photos at the inspection.</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {PHOTOS.map((p) => (
                    <PhotoSlot key={p.slot} label={p.slot} hint={p.hint} required={p.required} photo={d.photos[p.slot]} uploading={!!uploading[p.slot]} error={errors[`photo-${p.slot}`]}
                      onPick={(file) => void addPhoto(p.slot, file)}
                      onRemove={() => setD((prev) => ({ ...prev, photos: Object.fromEntries(Object.entries(prev.photos).filter(([k]) => k !== p.slot)) }))} />
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 'condition' && (
            <>
              <Section title="Condition & insurance" hint="Every car is inspected before it goes live, whatever the answers here." />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <Field label="Any accidents?" error={errors.accident}><Choice value={d.accident} onChange={(v) => set('accident', v)} options={YES_NO} /></Field>
                <Field label="Smoke-free?" error={errors.smokeFree}><Choice value={d.smokeFree} onChange={(v) => set('smokeFree', v)} options={YES_NO} /></Field>
                <Field label="Pet-free?" error={errors.petFree}><Choice value={d.petFree} onChange={(v) => set('petFree', v)} options={YES_NO} /></Field>
              </div>
              {d.accident === 'yes' && (
                <Field label="What happened?" htmlFor="accidentDetail" error={errors.accidentDetail}><Textarea id="accidentDetail" rows={3} maxLength={600} value={d.accidentDetail} onChange={(e) => set('accidentDetail', e.target.value)} /></Field>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Insurance company" htmlFor="carrier" error={errors.carrier}><Input id="carrier" value={d.carrier} onChange={(e) => set('carrier', e.target.value)} /></Field>
                <Field label="Policy number" htmlFor="policyNumber" error={errors.policyNumber}><Input id="policyNumber" value={d.policyNumber} onChange={(e) => set('policyNumber', e.target.value)} /></Field>
              </div>
              <Field label="Coverage" error={errors.coverage} hint="CatoDrive’s commercial cover applies while the car is with us.">
                <Choice value={d.coverage} onChange={(v) => set('coverage', v)} options={[{ value: 'full', label: 'Full coverage' }, { value: 'liability', label: 'Liability only' }, { value: 'unsure', label: 'Not sure' }]} />
              </Field>
            </>
          )}

          {step === 'confirm' && (
            <>
              <Section title="Confirm and send" />
              <Field label="When can the car be with us?" error={errors.availability}>
                <Choice value={d.availability} onChange={(v) => set('availability', v)} options={[{ value: 'fulltime', label: 'Full time' }, { value: 'parttime', label: 'Part time' }, { value: 'seasonal', label: 'Seasonal' }]} />
              </Field>
              <Field label="Anything else we should know?" htmlFor="notes" hint="Optional"><Textarea id="notes" rows={3} maxLength={1000} value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
              <dl className="grid grid-cols-1 gap-3 rounded-2xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
                {mode === 'partner' && <Summary label="You" value={`${d.fullName}${d.businessName && d.partnerType !== 'individual' ? ` · ${d.businessName}` : ''}`} />}
                <Summary label="Car" value={`${d.year} ${d.make} ${d.model}${d.trim ? ` ${d.trim}` : ''}`} />
                <Summary label="VIN" value={d.vin} mono />
                <Summary label="Mileage" value={d.mileage ? `${Number(d.mileage).toLocaleString('en-US')} mi` : ''} />
              </dl>
              <label className={cn('flex cursor-pointer gap-3 rounded-2xl border p-4 text-sm', errors.confirmed ? 'border-destructive' : 'border-border')}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={d.confirmed} onChange={(e) => set('confirmed', e.target.checked)} />
                <span>I confirm these details are accurate, I can place this car with CatoDrive, and I agree to a physical inspection before it goes live.</span>
              </label>
              {errors.confirmed && <p className="text-xs text-destructive">{errors.confirmed}</p>}
              {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" className={cn(stepIdx === 0 && 'invisible')} onClick={() => setStepIdx((i) => Math.max(0, i - 1))}>Back</Button>
        <Button type="button" className="w-full sm:w-auto" disabled={busy} loading={submitting} onClick={() => void next()}>
          {stepIdx === steps.length - 1 ? submitLabel : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Summary({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('break-words font-medium', mono && 'font-mono text-xs')}>{value || '-'}</dd>
    </div>
  );
}

function PhotoSlot({ label, hint, required, photo, uploading, error, onPick, onRemove }: {
  label: string; hint: string; required: boolean; photo?: Photo; uploading: boolean; error?: string;
  onPick: (file?: File) => void; onRemove: () => void;
}): ReactNode {
  return (
    <div className="min-w-0">
      <div className={cn('relative aspect-[4/3] overflow-hidden rounded-xl border-2 border-dashed', error ? 'border-destructive' : photo ? 'border-transparent' : 'border-border')}>
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`${label} photo`} className="h-full w-full object-cover" />
            <button type="button" onClick={onRemove} aria-label={`Remove ${label} photo`} className="absolute end-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"><X className="h-4 w-4" /></button>
          </>
        ) : (
          <label className="flex h-full cursor-pointer flex-col items-center justify-center gap-1 p-2 text-center hover:bg-accent/40">
            {/* Listing the image types makes iPhones send a JPEG instead of HEIC. */}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Camera className="h-5 w-5 text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">{uploading ? 'Uploading…' : hint}</span>
          </label>
        )}
      </div>
      <p className="mt-1 text-xs font-medium">{label}{required && <span className="text-destructive"> *</span>}</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
