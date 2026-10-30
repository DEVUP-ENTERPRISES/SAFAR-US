'use client';

import { useRef, useState } from 'react';
import { Camera, CheckCircle2, Circle, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { uploadFiles } from '@/features/media/upload';
import { FUEL_LABEL, type CarPatch, type FuelLevel, type HandoverInput, type ManualChecklistKey, type ReturnCar } from '@/features/asset-partners/returns-api';
import { ApiError } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';

const failMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : e instanceof Error && e.message.includes(':') ? e.message : fallback);

/** One car's return checklist; system checks show their live state, the rest are ticked by the runner. */
export function CarChecklist({ car, editable, photoMin, onPatch }: { car: ReturnCar; editable: boolean; photoMin: number; onPatch: (patch: CarPatch) => Promise<unknown> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [odometer, setOdometer] = useState(car.odometer != null ? String(car.odometer) : '');
  const [keys, setKeys] = useState(car.keysReturned != null ? String(car.keysReturned) : '');
  const [damage, setDamage] = useState(car.damageNotes ?? '');
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (key: string, patch: CarPatch) => {
    setBusy(key);
    setError(undefined);
    try {
      await onPatch(patch);
    } catch (e) {
      setError(failMessage(e, 'That didn’t save. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('photos');
    setError(undefined);
    try {
      const ups = await uploadFiles('trip_photo', Array.from(files).slice(0, 20));
      await onPatch({ addPhotos: ups.map((u) => ({ key: u.key })) });
    } catch (e) {
      setError(failMessage(e, 'Those photos didn’t upload. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const done = car.checklist.filter((i) => i.done).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{car.label}</p>
          {car.plate && <p className="text-xs text-muted-foreground">Plate {car.plate}</p>}
        </div>
        <Badge tone={done === car.checklist.length ? 'success' : 'warning'} className="tabular-nums">{done}/{car.checklist.length} done</Badge>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {car.checklist.map((i) => (
          <li key={i.key} className="flex items-start gap-3 p-3">
            {editable && !i.auto ? (
              <button
                type="button"
                className="mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${i.done ? 'Untick' : 'Tick'} ${i.label}`}
                aria-pressed={i.done}
                disabled={!!busy || (i.key === 'keys_returned' && !i.done && !(Number(keys) > 0))}
                onClick={() => run(i.key, { items: [{ key: i.key as ManualChecklistKey, done: !i.done }], ...(i.key === 'keys_returned' ? { keysReturned: Number(keys) } : {}) })}
              >
                {busy === i.key ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : i.done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
              </button>
            ) : (
              <span className="mt-0.5 shrink-0" aria-hidden>{i.done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', i.done && 'text-muted-foreground')}>
                {i.label}
                {i.auto && <span className="ms-2 text-xs font-normal text-muted-foreground">(checked by the system)</span>}
              </p>
              <p className="text-xs text-muted-foreground">{i.hint}</p>
              {i.note && <p className="mt-1 text-xs font-medium text-warning">{i.note}</p>}
              {i.key === 'keys_returned' && editable && (
                <div className="mt-2 w-32">
                  <Input aria-label="How many keys and fobs" type="number" inputMode="numeric" min={0} max={10} placeholder="How many" value={keys} onChange={(e) => setKeys(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editable && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Odometer (miles)" htmlFor={`odo-${car.vehicleId}`}>
            <Input id={`odo-${car.vehicleId}`} type="number" inputMode="numeric" min={0} value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, '').slice(0, 7))} onBlur={() => odometer && Number(odometer) !== car.odometer && run('odometer', { odometer: Number(odometer) })} />
          </Field>
          <Field label="Fuel or charge" htmlFor={`fuel-${car.vehicleId}`}>
            <Select id={`fuel-${car.vehicleId}`} value={car.fuelLevel ?? ''} onChange={(e) => run('fuel', { fuelLevel: e.target.value as FuelLevel })}>
              <option value="" disabled>Choose</option>
              {(Object.keys(FUEL_LABEL) as FuelLevel[]).map((f) => <option key={f} value={f}>{FUEL_LABEL[f]}</option>)}
            </Select>
          </Field>
          <Field label="Damage since intake (if any)" htmlFor={`dmg-${car.vehicleId}`} className="sm:col-span-2">
            <Textarea id={`dmg-${car.vehicleId}`} rows={2} maxLength={2000} value={damage} onChange={(e) => setDamage(e.target.value)} onBlur={() => damage !== (car.damageNotes ?? '') && run('damage', { damageNotes: damage })} />
          </Field>
        </div>
      )}
      {!editable && (car.odometer != null || car.fuelLevel || car.damageNotes) && (
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {car.odometer != null && <div><dt className="text-xs text-muted-foreground">Odometer</dt><dd className="tabular-nums">{car.odometer.toLocaleString()} mi</dd></div>}
          {car.fuelLevel && <div><dt className="text-xs text-muted-foreground">Fuel</dt><dd>{FUEL_LABEL[car.fuelLevel]}</dd></div>}
          {car.keysReturned != null && <div><dt className="text-xs text-muted-foreground">Keys</dt><dd className="tabular-nums">{car.keysReturned}</dd></div>}
          {car.damageNotes && <div className="col-span-full"><dt className="text-xs text-muted-foreground">Damage</dt><dd>{car.damageNotes}</dd></div>}
        </dl>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label font-semibold">Return photos <span className="font-normal text-muted-foreground tabular-nums">({car.photos.length} of {photoMin} needed)</span></p>
          {editable && (
            <>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => fileInput.current?.click()}>
                {busy === 'photos' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Add photos
              </Button>
            </>
          )}
        </div>
        {car.photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {car.photos.map((p) => (
              <li key={p.key} className="relative">
                <img src={p.url} alt={p.label ?? 'Return photo'} width={160} height={120} loading="lazy" className="aspect-[4/3] w-full rounded-sm object-cover" />
                {editable && (
                  <button type="button" aria-label="Remove photo" className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/90 shadow" disabled={!!busy} onClick={() => run('photos', { removePhotoKeys: [p.key] })}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** The handover: who took the car, where, and their typed signature. */
export function HandoverForm({ defaultName, allowed, onSubmit }: { defaultName?: string; allowed: HandoverInput['to'][]; onSubmit: (input: HandoverInput) => Promise<unknown> }) {
  const [to, setTo] = useState<HandoverInput['to']>(allowed[0]);
  const [name, setName] = useState(defaultName ?? '');
  const [signature, setSignature] = useState('');
  const [location, setLocation] = useState('');
  const [insured, setInsured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const storage = to === 'storage';
  const LABEL: Record<HandoverInput['to'], string> = { owner: 'The owner', representative: 'Their named representative', estate: 'The estate’s representative', storage: 'Into storage' };

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onSubmit({ to, receiverName: name.trim(), receiverSignature: signature.trim(), location: location.trim(), ownerInsuranceConfirmed: insured });
    } catch (e) {
      setError(failMessage(e, 'That didn’t go through. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Who received the car" htmlFor="handover-to">
        <Select id="handover-to" value={to} onChange={(e) => setTo(e.target.value as HandoverInput['to'])}>
          {allowed.map((a) => <option key={a} value={a}>{LABEL[a]}</option>)}
        </Select>
      </Field>
      {!storage && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Their full name" htmlFor="handover-name">
            <Input id="handover-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Their signature" htmlFor="handover-sign" hint="Hand them the phone: they type their full name.">
            <Input id="handover-sign" maxLength={120} autoComplete="off" value={signature} onChange={(e) => setSignature(e.target.value)} className="font-display italic" />
          </Field>
        </div>
      )}
      <Field label={storage ? 'Storage location' : 'Where it was handed over'} htmlFor="handover-where">
        <Input id="handover-where" maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      {!storage && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={insured} onChange={(e) => setInsured(e.target.checked)} />
          <span>They confirmed their own insurance covers the car from today. CatoDrive’s insurance has ended for this car.</span>
        </label>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button className="w-full sm:w-auto" loading={busy} onClick={submit}>Hand over and send for approval</Button>
      </div>
    </div>
  );
}
