'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ClipboardCheck, Download, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { uploadFiles } from '@/features/media/upload';
import type { FuelLevel, IntakeStatus } from '@/features/asset-partners/api';
import { partnerManageApi, type IntakeInput } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';
import { saveFile } from '@/lib/utils/save-file';

const manage = partnerManageApi('/ioc');

const STATUS: Record<IntakeStatus, { label: string; tone: 'warning' | 'success' | 'destructive' | 'muted' }> = {
  awaiting_partner: { label: 'Waiting for partner', tone: 'warning' },
  acknowledged: { label: 'Signed by partner', tone: 'success' },
  objected: { label: 'Partner objected', tone: 'destructive' },
  deemed_accepted: { label: 'Accepted (no reply)', tone: 'muted' },
};

type Form = Omit<IntakeInput, 'odometer'> & { odometer: string };

const blank = (): Form => ({
  vehicle: { year: '', make: '', model: '', trim: '', color: '', vin: '', plate: '' },
  odometer: '', estimatedMarketValue: '', listingUrl: '', intakeDate: new Date().toISOString().slice(0, 10), location: '',
  fuelLevel: 'full', preExistingDamage: '', conditionNotes: '', photos: [], signedName: '', signedTitle: '',
});

/** Agreement Exhibit A for each car: CatoDrive records and signs the condition at intake; the partner reviews it in their portal. */
export function IntakeReports({ partnerId, applications }: { partnerId: string; applications: { _id: string; reference: string; status: string; vehicle: { year: string; make: string; model: string } }[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['ioc-intakes', partnerId], queryFn: () => manage.intakes(partnerId) });
  const approved = applications.filter((a) => a.status === 'approved');
  const [open, setOpen] = useState(false);
  const [appId, setAppId] = useState(approved[0]?._id ?? '');
  const [form, setForm] = useState<Form>(blank);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!open) return;
    void manage.intakeDraft(partnerId, appId || undefined).then((d) => {
      setForm((f) => ({
        ...f,
        applicationId: d.applicationId,
        vehicleId: d.vehicleId,
        vehicle: { ...f.vehicle, ...(d.vehicle ?? {}) },
        odometer: d.odometer !== undefined ? String(d.odometer) : f.odometer,
        estimatedMarketValue: d.estimatedMarketValue ?? f.estimatedMarketValue,
      }));
    }).catch(() => undefined);
  }, [open, appId, partnerId]);

  const v = form.vehicle;
  const setV = (k: keyof Form['vehicle'], value: string) => setForm((f) => ({ ...f, vehicle: { ...f.vehicle, [k]: value } }));
  const valid = /^\d{4}$/.test(v.year) && v.make && v.model && v.vin.trim().length === 17 && v.plate.trim().length >= 2
    && form.odometer !== '' && form.location.trim().length >= 3 && form.preExistingDamage.trim() && form.signedName.trim().length >= 2 && form.signedTitle.trim().length >= 2;

  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () => manage.createIntake(partnerId, {
      ...form,
      odometer: Number(form.odometer),
      vehicle: { ...v, trim: v.trim || undefined, color: v.color || undefined },
      estimatedMarketValue: form.estimatedMarketValue || undefined,
      listingUrl: form.listingUrl || undefined,
      conditionNotes: form.conditionNotes || undefined,
    }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Intake report signed', description: 'The partner has been asked to review it.' });
      setOpen(false);
      setForm(blank());
      void qc.invalidateQueries({ queryKey: ['ioc-intakes', partnerId] });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save the report' }),
  });

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const ups = await uploadFiles('vehicle_photo', Array.from(files).slice(0, 20));
      setForm((f) => ({ ...f, photos: [...(f.photos ?? []), ...ups.map((u) => ({ url: u.url, key: u.key }))].slice(0, 40) }));
    } catch (e) {
      toast({ tone: 'error', title: e instanceof Error ? e.message : 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const pdf = async (id: string) => {
    setBusy(id);
    try {
      const { blob, filename } = await manage.intakePdf(partnerId, id);
      saveFile(blob, filename ?? 'intake-report.pdf');
    } catch {
      toast({ tone: 'error', title: 'That download didn’t work' });
    } finally {
      setBusy('');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-primary" /> Intake reports (Exhibit A)</CardTitle>
        <Button size="sm" variant={open ? 'outline' : 'primary'} onClick={() => setOpen((o) => !o)}>{open ? 'Cancel' : 'New intake report'}</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {open && (
          <div className="space-y-4 rounded-2xl border border-border p-4">
            {approved.length > 0 && (
              <Field label="Car">
                <Select value={appId} onChange={(e) => setAppId(e.target.value)}>
                  {approved.map((a) => <option key={a._id} value={a._id}>{a.vehicle.year} {a.vehicle.make} {a.vehicle.model} · {a.reference}</option>)}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Year"><Input inputMode="numeric" maxLength={4} value={v.year} onChange={(e) => setV('year', e.target.value)} /></Field>
              <Field label="Make"><Input value={v.make} onChange={(e) => setV('make', e.target.value)} /></Field>
              <Field label="Model"><Input value={v.model} onChange={(e) => setV('model', e.target.value)} /></Field>
              <Field label="Trim"><Input value={v.trim ?? ''} onChange={(e) => setV('trim', e.target.value)} /></Field>
              <Field label="Color"><Input value={v.color ?? ''} onChange={(e) => setV('color', e.target.value)} /></Field>
              <Field label="VIN" className="col-span-2"><Input className="font-mono uppercase" maxLength={17} value={v.vin} onChange={(e) => setV('vin', e.target.value.toUpperCase())} /></Field>
              <Field label="Plate"><Input className="uppercase" value={v.plate} onChange={(e) => setV('plate', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Odometer (miles)"><Input inputMode="numeric" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="Estimated market value"><Input value={form.estimatedMarketValue ?? ''} placeholder="$38,000" onChange={(e) => setForm({ ...form, estimatedMarketValue: e.target.value })} /></Field>
              <Field label="Fuel / charge"><Select value={form.fuelLevel} onChange={(e) => setForm({ ...form, fuelLevel: e.target.value as FuelLevel })}><option value="full">Full</option><option value="three_quarters">3/4</option><option value="half">1/2</option><option value="quarter">1/4</option></Select></Field>
              <Field label="Intake date"><Input type="date" value={form.intakeDate} onChange={(e) => setForm({ ...form, intakeDate: e.target.value })} /></Field>
              <Field label="Intake location" className="sm:col-span-2"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
              <Field label="Listing URL" className="sm:col-span-3" hint="Optional"><Input type="url" value={form.listingUrl ?? ''} onChange={(e) => setForm({ ...form, listingUrl: e.target.value })} /></Field>
            </div>
            <Field label="Pre-existing damage" hint="Write “None” if there is none."><Textarea rows={3} maxLength={2000} value={form.preExistingDamage} onChange={(e) => setForm({ ...form, preExistingDamage: e.target.value })} /></Field>
            <Field label="Condition notes" hint="Optional"><Textarea rows={2} maxLength={2000} value={form.conditionNotes ?? ''} onChange={(e) => setForm({ ...form, conditionNotes: e.target.value })} /></Field>
            <div>
              <p className="mb-2 text-sm font-medium">Photos</p>
              <div className="flex flex-wrap gap-2">
                {(form.photos ?? []).map((p, i) => (
                  <div key={p.url} className="relative h-20 w-24 overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Intake photo ${i + 1}`} className="h-full w-full object-cover" />
                    <button type="button" aria-label="Remove photo" className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white" onClick={() => setForm((f) => ({ ...f, photos: (f.photos ?? []).filter((x) => x.url !== p.url) }))}><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <label className="grid h-20 w-24 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:bg-accent/40">
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Your name (signature)"><Input value={form.signedName} onChange={(e) => setForm({ ...form, signedName: e.target.value })} /></Field>
              <Field label="Your title"><Input value={form.signedTitle} placeholder="Fleet Operations Manager" onChange={(e) => setForm({ ...form, signedTitle: e.target.value })} /></Field>
            </div>
            <Button className="w-full sm:w-auto" disabled={!valid || uploading} loading={save.isPending} onClick={() => save.mutate()}>Sign and send to partner</Button>
          </div>
        )}

        {list.data?.length ? (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {list.data.map((r) => (
              <div key={r._id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Intake {formatDate(r.intakeDate)} · {r.odometer.toLocaleString('en-US')} mi · signed by {r.catodriveSignature.name}
                    {r.status === 'awaiting_partner' && ` · reply by ${formatDate(r.respondBy)}`}
                  </p>
                  {r.partnerResponse?.kind === 'objected' && <p className="mt-1 text-sm text-destructive">“{r.partnerResponse.objection}”</p>}
                </div>
                <Button variant="outline" size="sm" className="w-full sm:w-auto" loading={busy === r._id} onClick={() => void pdf(r._id)}><Download className="h-4 w-4" /> PDF</Button>
              </div>
            ))}
          </div>
        ) : !open && <p className="text-sm text-muted-foreground">No intake reports yet. Record one at the car’s inspection.</p>}
      </CardContent>
    </Card>
  );
}
