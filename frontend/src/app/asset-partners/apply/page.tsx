'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, CheckCircle2, Sparkles, Camera } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/features/auth/store';
import { uploadFiles } from '@/features/media/upload';
import { assetPartnerApi, type CreateAssetPartnerApplicationInput } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';
import { BRAND } from '@/features/marketing/sections';

/**
 * The Asset Partner Vehicle Intake — a 6-step qualification form.
 *
 * Built entirely in CATO's own design system (hero-mesh, primary teal,
 * Archivo display type, the app's real Field/Input/Select/Chip/Button
 * primitives, Reveal motion) — not a skin ported from the reference mockup.
 * Same brand as every other page on the site, because this is CATO's own
 * intake, not a separate product.
 *
 * No login required — it's a lead, not an account. Real submission hits
 * POST /asset-partner-applications; the server generates the reference shown
 * on confirmation. Photos are optional; a signed-in visitor's photo uploads
 * for real, otherwise it's simply marked chosen and left for the follow-up
 * (the form says so).
 */

const TOTAL_STEPS = 6;

type YN = 'yes' | 'no' | '';

interface FormState {
  fullName: string; businessName: string; partnerType: string; email: string; phone: string;
  address: string; city: string; state: string; zip: string; referral: string;
  vYear: string; vMake: string; vModel: string; vTrim: string; vMileage: string;
  vExtColor: string; vIntColor: string; vin: string; plate: string;
  ownership: string; lienholder: string; lienAcct: string; marketValue: string;
  accident: YN; accidentDetail: string; smokeFree: YN; petFree: YN; maintRecords: YN;
  insCarrier: string; insPolicy: string; coverageType: string; insExpiry: string;
  availability: string; zone: string; startDate: string; notes: string;
  ackAccurate: boolean; ackInspection: boolean; ackTerms: boolean;
  signature: string; signDate: string;
}

const EMPTY: FormState = {
  fullName: '', businessName: '', partnerType: '', email: '', phone: '',
  address: '', city: '', state: 'TX', zip: '', referral: '',
  vYear: '', vMake: '', vModel: '', vTrim: '', vMileage: '',
  vExtColor: '', vIntColor: '', vin: '', plate: '',
  ownership: '', lienholder: '', lienAcct: '', marketValue: '',
  accident: '', accidentDetail: '', smokeFree: '', petFree: '', maintRecords: '',
  insCarrier: '', insPolicy: '', coverageType: '', insExpiry: '',
  availability: '', zone: '', startDate: '', notes: '',
  ackAccurate: false, ackInspection: false, ackTerms: false,
  signature: '', signDate: '',
};

const PHOTO_SLOTS = ['Front', 'Rear', 'Sides', 'Interior', 'Odometer', 'Damage'] as const;

const STEP_TITLES = [
  { eyebrow: '01 — About you', title: 'Partner information', desc: 'Who we’ll be working with. If you’re applying on behalf of a business or a small fleet, use the business fields.' },
  { eyebrow: '02 — The vehicle', title: 'Vehicle details', desc: 'Applying with more than one vehicle? Submit this form for your primary vehicle and list the rest in the notes field at the end.' },
  { eyebrow: '03 — Ownership', title: 'Ownership & title', desc: 'This confirms you’re able to enter into an Asset Partner agreement for this vehicle.' },
  { eyebrow: '04 — Condition', title: 'Vehicle condition', desc: 'Answer honestly — every vehicle is physically inspected before approval regardless of these answers.' },
  { eyebrow: '05 — Insurance', title: 'Current insurance', desc: `${BRAND} maintains commercial coverage while your vehicle is active on the platform. We still need your personal policy on file.` },
  { eyebrow: '06 — Preferences & agreement', title: 'Availability & final details', desc: 'Last step. Tell us your availability, then confirm the details below.' },
] as const;

export default function AssetPartnerApplyPage() {
  const notify = useToast();
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const [phase, setPhase] = useState<'form' | 'confirm'>('form');
  const [step, setStep] = useState(1);
  const [f, setF] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<Record<string, { url: string; key?: string } | 'pending' | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState('');

  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const clearErr = (k: string) => setErrors((prev) => { if (!prev.has(k)) return prev; const n = new Set(prev); n.delete(k); return n; });

  type StringField = Exclude<keyof FormState, 'ackAccurate' | 'ackInspection' | 'ackTerms'>;
  const requiredByStep: Record<number, StringField[]> = {
    1: ['fullName', 'partnerType', 'email', 'phone', 'address', 'city', 'state', 'zip'],
    2: ['vYear', 'vMake', 'vModel', 'vMileage', 'vin', 'plate'],
    3: ['ownership'],
    4: ['accident', 'smokeFree', 'petFree'],
    5: ['insCarrier', 'insPolicy', 'coverageType'],
    6: ['availability', 'signature', 'signDate'],
  };

  const validateStep = (n: number): boolean => {
    const next = new Set<string>();
    for (const k of requiredByStep[n] ?? []) {
      const v = f[k];
      if (!v || (k === 'email' && !/^\S+@\S+\.\S+$/.test(v))) next.add(k);
    }
    if (n === 6 && (!f.ackAccurate || !f.ackInspection || !f.ackTerms)) next.add('acks');
    setErrors(next);
    return next.size === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (step === TOTAL_STEPS) return void submit();
    setStep((s) => s + 1);
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const pickPhoto = async (slot: string, file: File | undefined) => {
    if (!file) return;
    if (!authed) {
      setPhotos((p) => ({ ...p, [slot]: 'pending' }));
      return;
    }
    setPhotos((p) => ({ ...p, [slot]: 'pending' }));
    try {
      const [uploaded] = await uploadFiles('vehicle_photo', [file]);
      setPhotos((p) => ({ ...p, [slot]: { url: uploaded.url, key: uploaded.key } }));
    } catch {
      notify({ tone: 'error', title: 'Photo didn’t upload', description: 'You can email it to partners@catodrive.com instead.' });
      setPhotos((p) => ({ ...p, [slot]: undefined }));
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const uploadedPhotos = Object.entries(photos)
        .filter((e): e is [string, { url: string; key?: string }] => typeof e[1] === 'object')
        .map(([label, v]) => ({ label, url: v.url, key: v.key }));

      const payload: CreateAssetPartnerApplicationInput = {
        fullName: f.fullName, businessName: f.businessName || undefined,
        partnerType: f.partnerType as CreateAssetPartnerApplicationInput['partnerType'],
        email: f.email, phone: f.phone, address: f.address, city: f.city, state: f.state, zip: f.zip,
        referral: f.referral || undefined,
        vehicle: {
          year: f.vYear, make: f.vMake, model: f.vModel, trim: f.vTrim || undefined,
          mileage: Number(f.vMileage.replace(/[^\d]/g, '')) || 0,
          exteriorColor: f.vExtColor || undefined, interiorColor: f.vIntColor || undefined,
          vin: f.vin.toUpperCase(), plate: f.plate,
        },
        ownership: f.ownership as CreateAssetPartnerApplicationInput['ownership'],
        lienholder: f.lienholder || undefined, lienAccountLast4: f.lienAcct || undefined,
        estimatedMarketValue: f.marketValue || undefined,
        accident: f.accident as 'yes' | 'no', accidentDetail: f.accidentDetail || undefined,
        smokeFree: f.smokeFree as 'yes' | 'no', petFree: f.petFree as 'yes' | 'no',
        hasMaintenanceRecords: (f.maintRecords || undefined) as 'yes' | 'no' | undefined,
        photos: uploadedPhotos.length ? uploadedPhotos : undefined,
        insurance: {
          carrier: f.insCarrier, policyNumber: f.insPolicy,
          coverageType: f.coverageType as CreateAssetPartnerApplicationInput['insurance']['coverageType'],
          policyExpiry: f.insExpiry || undefined,
        },
        availability: f.availability as CreateAssetPartnerApplicationInput['availability'],
        preferredZone: f.zone || undefined, targetStartDate: f.startDate || undefined, notes: f.notes || undefined,
        acknowledgedAccurate: f.ackAccurate, acknowledgedInspection: f.ackInspection, acknowledgedTerms: f.ackTerms,
        signature: f.signature, signDate: f.signDate,
      };

      const res = await assetPartnerApi.apply(payload);
      setReference(res.reference);
      setPhase('confirm');
    } catch (err) {
      notify({
        tone: 'error',
        title: 'Couldn’t submit',
        description: err instanceof ApiError ? err.message : 'Please check the form and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'confirm') {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <Reveal>
          <span className="grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success ring-1 ring-success/20">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="display mt-6 text-3xl">Application received</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Thanks — a member of the {BRAND} partnerships team will review your submission and reach out within 2–3
            business days to schedule your vehicle assessment.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Questions in the meantime? Email <a href="mailto:shoaib@catodrive.com" className="font-medium text-primary underline">shoaib@catodrive.com</a>{' '}
            or call <a href="tel:+12148140402" className="font-medium text-primary underline">(214) 814-0402</a>.
          </p>
          <p className="numeric mt-6 text-lg font-bold text-primary">Reference: {reference}</p>
          {/* Somewhere to actually go next. Without this the reference number
              was the only trace of the application the applicant ever saw. */}
          <Link href="/asset-partners/dashboard" className="mt-8 inline-block">
            <Button size="lg" className="rounded-xl">
              Track your application <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            Sign in with this email to follow your application and, once you’re live, your earnings.
          </p>
          <Link href="/asset-partners" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Asset Partners
          </Link>
        </Reveal>
      </div>
    );
  }

  const { eyebrow, title, desc } = STEP_TITLES[step - 1];

  return (
    <div className="-mt-6">
      {/* Progress header, on-brand hero-mesh */}
      <section className="full-bleed relative isolate grain overflow-hidden hero-mesh">
        <div className="mx-auto max-w-2xl px-5 py-10 sm:py-12">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-semibold text-white/70">
              <Sparkles className="h-4 w-4 text-primary-soft" /> Asset Partner Intake
            </span>
            <span className="font-bold text-white">Step {step} of {TOTAL_STEPS}</span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-5 pb-24 pt-10">
        <Reveal key={step}>
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{eyebrow}</span>
          <h1 className="display mt-2 text-3xl sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{desc}</p>

          <div className="mt-9 space-y-6">
            {step === 1 && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Full legal name *" error={errors.has('fullName') ? 'Enter your full legal name.' : undefined}>
                    <Input value={f.fullName} onChange={(e) => { set('fullName')(e.target.value); clearErr('fullName'); }} placeholder="Jordan Ramirez" />
                  </Field>
                  <Field label="Business name (optional)">
                    <Input value={f.businessName} onChange={(e) => set('businessName')(e.target.value)} placeholder="Ramirez Fleet Holdings LLC" />
                  </Field>
                </div>
                <ChoiceField label="Partner type *" error={errors.has('partnerType')} value={f.partnerType} onChange={(v) => { set('partnerType')(v); clearErr('partnerType'); }} options={[['individual', 'Individual owner'], ['business', 'Business owner'], ['fleet', 'Fleet operator (3+ vehicles)']]} />
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Email address *" error={errors.has('email') ? 'Enter a valid email address.' : undefined}>
                    <Input type="email" value={f.email} onChange={(e) => { set('email')(e.target.value); clearErr('email'); }} placeholder="jordan@email.com" />
                  </Field>
                  <Field label="Phone number *" error={errors.has('phone') ? 'Enter a valid phone number.' : undefined}>
                    <Input type="tel" value={f.phone} onChange={(e) => { set('phone')(e.target.value); clearErr('phone'); }} placeholder="(214) 555-0142" />
                  </Field>
                </div>
                <Field label="Mailing address *" error={errors.has('address') ? 'Required.' : undefined}>
                  <Input value={f.address} onChange={(e) => { set('address')(e.target.value); clearErr('address'); }} placeholder="Street address" />
                </Field>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="City *" error={errors.has('city') ? 'Required.' : undefined}>
                    <Input value={f.city} onChange={(e) => { set('city')(e.target.value); clearErr('city'); }} />
                  </Field>
                  <Field label="State *" error={errors.has('state') ? 'Required.' : undefined}>
                    <Input value={f.state} onChange={(e) => { set('state')(e.target.value.toUpperCase().slice(0, 2)); clearErr('state'); }} />
                  </Field>
                  <Field label="ZIP *" error={errors.has('zip') ? 'Required.' : undefined}>
                    <Input value={f.zip} onChange={(e) => { set('zip')(e.target.value); clearErr('zip'); }} placeholder="75201" />
                  </Field>
                </div>
                <Field label="How did you hear about CatoDrive? (optional)">
                  <Select value={f.referral} onChange={(e) => set('referral')(e.target.value)}>
                    <option value="">Select one…</option>
                    {['Existing CatoDrive renter', 'Another Asset Partner / referral', 'Social media', 'Search engine', 'DFW Airport / hotel signage', 'Other'].map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Year *" error={errors.has('vYear') ? 'Required.' : undefined}><Input value={f.vYear} onChange={(e) => { set('vYear')(e.target.value); clearErr('vYear'); }} placeholder="2024" /></Field>
                  <Field label="Make *" error={errors.has('vMake') ? 'Required.' : undefined}><Input value={f.vMake} onChange={(e) => { set('vMake')(e.target.value); clearErr('vMake'); }} placeholder="BMW" /></Field>
                  <Field label="Model *" error={errors.has('vModel') ? 'Required.' : undefined}><Input value={f.vModel} onChange={(e) => { set('vModel')(e.target.value); clearErr('vModel'); }} placeholder="5 Series" /></Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Trim (optional)"><Input value={f.vTrim} onChange={(e) => set('vTrim')(e.target.value)} placeholder="530i M Sport" /></Field>
                  <Field label="Current mileage *" error={errors.has('vMileage') ? 'Required.' : undefined}><Input type="number" value={f.vMileage} onChange={(e) => { set('vMileage')(e.target.value); clearErr('vMileage'); }} placeholder="18,400" /></Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Exterior color"><Input value={f.vExtColor} onChange={(e) => set('vExtColor')(e.target.value)} placeholder="Alpine White" /></Field>
                  <Field label="Interior color"><Input value={f.vIntColor} onChange={(e) => set('vIntColor')(e.target.value)} placeholder="Cognac" /></Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="VIN *" error={errors.has('vin') ? 'Enter a valid 17-character VIN.' : undefined}><Input value={f.vin} onChange={(e) => { set('vin')(e.target.value.toUpperCase().slice(0, 17)); clearErr('vin'); }} placeholder="17-character VIN" /></Field>
                  <Field label="License plate / state *" error={errors.has('plate') ? 'Required.' : undefined}><Input value={f.plate} onChange={(e) => { set('plate')(e.target.value); clearErr('plate'); }} placeholder="ABC-1234 / TX" /></Field>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Eligibility guideline: {BRAND}’s fleet is positioned as premium / white-glove, which typically means
                  late-model vehicles with moderate mileage. Exact age and mileage cutoffs are confirmed during vehicle
                  assessment.
                </p>
              </>
            )}

            {step === 3 && (
              <>
                <ChoiceField label="Ownership status *" error={errors.has('ownership')} value={f.ownership} onChange={(v) => { set('ownership')(v); clearErr('ownership'); }} options={[['owned', 'Owned free & clear'], ['financed', 'Financed'], ['leased', 'Leased']]} />
                {(f.ownership === 'financed' || f.ownership === 'leased') && (
                  <Card className="border-primary/20 bg-primary/[0.04]">
                    <CardContent className="space-y-4 py-5">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Lienholder / lender name"><Input value={f.lienholder} onChange={(e) => set('lienholder')(e.target.value)} placeholder="e.g., Chase Auto Finance" /></Field>
                        <Field label="Loan / lease account (last 4, optional)"><Input value={f.lienAcct} onChange={(e) => set('lienAcct')(e.target.value.slice(0, 4))} placeholder="••••1234" /></Field>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        If financed or leased, most lenders require written consent before a vehicle is used for
                        commercial rental. {BRAND} will request a lien release or lender consent letter during onboarding.
                      </p>
                    </CardContent>
                  </Card>
                )}
                <Field label="Estimated current market value (optional)" hint="A starting point only — CatoDrive uses an independent valuation guide during assessment.">
                  <Input value={f.marketValue} onChange={(e) => set('marketValue')(e.target.value)} placeholder="$38,000" />
                </Field>
              </>
            )}

            {step === 4 && (
              <>
                <ChoiceField label="Has this vehicle been in an accident? *" error={errors.has('accident')} value={f.accident} onChange={(v) => { set('accident')(v as YN); clearErr('accident'); }} options={[['no', 'No'], ['yes', 'Yes']]} />
                {f.accident === 'yes' && (
                  <Card className="border-primary/20 bg-primary/[0.04]">
                    <CardContent className="py-5">
                      <Field label="Briefly describe">
                        <Textarea value={f.accidentDetail} onChange={(e) => set('accidentDetail')(e.target.value)} placeholder="Date, extent of damage, and whether it was professionally repaired" />
                      </Field>
                    </CardContent>
                  </Card>
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                  <ChoiceField label="Smoke-free vehicle? *" error={errors.has('smokeFree')} value={f.smokeFree} onChange={(v) => { set('smokeFree')(v as YN); clearErr('smokeFree'); }} options={[['yes', 'Yes'], ['no', 'No']]} />
                  <ChoiceField label="Pet-free vehicle? *" error={errors.has('petFree')} value={f.petFree} onChange={(v) => { set('petFree')(v as YN); clearErr('petFree'); }} options={[['yes', 'Yes'], ['no', 'No']]} />
                </div>
                <ChoiceField label="Recent maintenance records available?" value={f.maintRecords} onChange={(v) => set('maintRecords')(v as YN)} options={[['yes', 'Yes'], ['no', 'No']]} />

                <div>
                  <label className="text-sm font-medium text-foreground">Vehicle photos <span className="font-normal text-muted-foreground">(optional — you can also email these later)</span></label>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {PHOTO_SLOTS.map((slot) => {
                      const p = photos[slot];
                      const filled = !!p;
                      return (
                        <label
                          key={slot}
                          className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                            filled ? 'border-success bg-success/5' : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => pickPhoto(slot, e.target.files?.[0])} />
                          {p === 'pending' ? (
                            <span className="h-5 w-5 animate-pulse rounded-full bg-muted-foreground/30" />
                          ) : filled ? (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          ) : (
                            <Camera className="h-5 w-5 text-muted-foreground" />
                          )}
                          <span className={`text-xs font-medium ${filled ? 'text-success' : 'text-muted-foreground'}`}>{slot}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Insurance carrier *" error={errors.has('insCarrier') ? 'Required.' : undefined}><Input value={f.insCarrier} onChange={(e) => { set('insCarrier')(e.target.value); clearErr('insCarrier'); }} placeholder="e.g., State Farm" /></Field>
                  <Field label="Policy number *" error={errors.has('insPolicy') ? 'Required.' : undefined}><Input value={f.insPolicy} onChange={(e) => { set('insPolicy')(e.target.value); clearErr('insPolicy'); }} placeholder="Policy number" /></Field>
                </div>
                <ChoiceField
                  label="Coverage type *" error={errors.has('coverageType')} value={f.coverageType}
                  onChange={(v) => { set('coverageType')(v); clearErr('coverageType'); }}
                  options={[['full', 'Full coverage (comprehensive & collision)'], ['liability', 'Liability only'], ['unsure', 'Not sure']]}
                  hint="Full coverage is typically required to list a vehicle as an Asset Partner, since liability-only insurance doesn’t cover damage to the vehicle itself."
                />
                <Field label="Policy expiration date (optional)">
                  <Input type="date" value={f.insExpiry} onChange={(e) => set('insExpiry')(e.target.value)} />
                </Field>
              </>
            )}

            {step === 6 && (
              <>
                <ChoiceField label="Vehicle availability *" error={errors.has('availability')} value={f.availability} onChange={(v) => { set('availability')(v); clearErr('availability'); }} options={[['fulltime', 'Full-time on the fleet'], ['parttime', 'Part-time / set schedule'], ['seasonal', 'Seasonal only']]} />
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Preferred pickup / delivery zone (optional)">
                    <Select value={f.zone} onChange={(e) => set('zone')(e.target.value)}>
                      <option value="">Select a zone…</option>
                      {['Downtown / Uptown Dallas', 'DFW Airport area', 'Love Field area', 'Fort Worth', 'Plano / Frisco', 'Other DFW area'].map((o) => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  </Field>
                  <Field label="Target start date (optional)">
                    <Input type="date" value={f.startDate} onChange={(e) => set('startDate')(e.target.value)} />
                  </Field>
                </div>
                <Field label="Notes (optional)">
                  <Textarea value={f.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Additional vehicles, questions, scheduling constraints" />
                </Field>

                <Card>
                  <CardContent className="divide-y divide-border py-2">
                    <Ack checked={f.ackAccurate} onChange={(v) => { set('ackAccurate')(v); clearErr('acks'); }} bold="I certify" rest="that the information provided in this form is true and accurate to the best of my knowledge." />
                    <Ack checked={f.ackInspection} onChange={(v) => { set('ackInspection')(v); clearErr('acks'); }} bold="I understand" rest={`${BRAND} will conduct an in-person vehicle inspection before final approval, and that submitting this form does not guarantee acceptance into the Asset Partner program.`} />
                    <Ack checked={f.ackTerms} onChange={(v) => { set('ackTerms')(v); clearErr('acks'); }} bold="I have read and agree" rest="to the CatoDrive Asset Partner Program Terms, including vehicle eligibility requirements and revenue-share structure, to be confirmed in writing before onboarding." />
                  </CardContent>
                </Card>
                {errors.has('acks') && <p className="text-sm text-destructive">All three acknowledgements are required.</p>}

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Typed signature (full legal name) *" error={errors.has('signature') ? 'Required.' : undefined}><Input value={f.signature} onChange={(e) => { set('signature')(e.target.value); clearErr('signature'); }} placeholder="Type your full name" /></Field>
                  <Field label="Date *" error={errors.has('signDate') ? 'Required.' : undefined}><Input type="date" value={f.signDate} onChange={(e) => { set('signDate')(e.target.value); clearErr('signDate'); }} /></Field>
                </div>
              </>
            )}
          </div>
        </Reveal>

        <div className="mt-10 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={goBack}
            className={`flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground ${step === 1 ? 'invisible' : ''}`}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <Button onClick={goNext} loading={submitting} size="lg" className="min-w-[10rem]">
            {step === TOTAL_STEPS ? 'Submit application' : 'Continue'} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChoiceField({ label, error, value, onChange, options, hint }: {
  label: string; error?: boolean; value: string; onChange: (v: string) => void; options: [string, string][]; hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <Chip key={v} active={value === v} onClick={() => onChange(v)} type="button">{l}</Chip>
        ))}
      </div>
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">Select an option.</p>}
    </div>
  );
}

function Ack({ checked, onChange, bold, rest }: { checked: boolean; onChange: (v: boolean) => void; bold: string; rest: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-3.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-primary" />
      <span className="text-sm leading-relaxed text-muted-foreground"><b className="font-semibold text-foreground">{bold}</b> {rest}</span>
    </label>
  );
}

