'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Fraunces, Inter } from 'next/font/google';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/features/auth/store';
import { uploadFiles } from '@/features/media/upload';
import { assetPartnerApi, type CreateAssetPartnerApplicationInput } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';
import styles from './apply.module.css';

const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-fraunces' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });

/**
 * The Asset Partner Vehicle Intake — a 6-step qualification form, ported from
 * the supplied design. Deliberately its own dark/brass/serif identity, apart
 * from the app's teal marketplace brand: this is a vetting flow, not a
 * booking surface.
 *
 * No login required (the form never asks for a password) — it's a lead, not
 * an account. Real submission hits POST /asset-partner-applications; the
 * server generates the reference shown on confirmation. Photos are optional
 * (the form itself allows emailing them later); when the visitor happens to
 * be signed in, a selected photo is uploaded for real, otherwise it's simply
 * marked chosen and left for the follow-up.
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

export default function AssetPartnerApplyPage() {
  const notify = useToast();
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const [phase, setPhase] = useState<'hero' | 'form' | 'confirm'>('hero');
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
      // Not signed in: the form allows emailing photos later — just mark chosen.
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

  return (
    <div className={`${styles.wrap} ${fraunces.variable} ${inter.variable} ${styles.sans}`}>
      <div className={styles.grain} />

      {phase === 'hero' && (
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.mark}>
              <span className={`${styles.markBadge} ${styles.serif}`}>C</span>
              <span className={`${styles.markWord} ${styles.serif}`}>Cato<b>Drive</b></span>
            </div>

            <h1 className={`${styles.h1} ${styles.serif}`}>Put your vehicle to work in Dallas–Fort Worth</h1>
            <p className={styles.lede}>
              CatoDrive delivers premium vehicles across DFW — the airport, Love Field, hotels, and doorsteps — with
              white-glove service. As an Asset Partner, your vehicle joins that fleet and earns while we handle the
              driving, delivery, and care.
            </p>

            <div className={styles.heroFacts}>
              <div className={styles.heroFact}><span className={`${styles.num} ${styles.serif}`}>75+</span><span className={styles.lbl}>vehicles in the current fleet</span></div>
              <div className={styles.heroFact}><span className={`${styles.num} ${styles.serif}`}>DFW</span><span className={styles.lbl}>Airport, Love Field &amp; hotel delivery</span></div>
              <div className={styles.heroFact}><span className={`${styles.num} ${styles.serif}`}>10 min</span><span className={styles.lbl}>to complete this intake form</span></div>
            </div>

            <div className={styles.process}>
              {[
                ['01', 'Submit this intake form', 'Tell us about you and your vehicle — about 10 minutes.'],
                ['02', 'Vehicle assessment', 'Our team reviews eligibility and schedules an in-person inspection.'],
                ['03', 'Onboarding & agreement', 'We confirm terms, photograph the vehicle, and set your availability.'],
                ['04', 'Start earning', 'Your vehicle goes live on the CatoDrive fleet.'],
              ].map(([n, t, d]) => (
                <div key={n} className={styles.processRow}>
                  <div className={`${styles.stepNo} ${styles.serif}`}>{n}</div>
                  <div className={styles.processTxt}><b>{t}</b><span>{d}</span></div>
                </div>
              ))}
            </div>

            <button className={styles.ctaStart} onClick={() => setPhase('form')}>Start the intake form →</button>
          </div>
        </section>
      )}

      {phase === 'form' && (
        <div className={styles.formWrap}>
          <div className={styles.progressShell}>
            <div className={styles.progressLabel}>
              <span>Asset Partner Intake</span>
              <b>Step {step} of {TOTAL_STEPS}</b>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
            </div>
          </div>

          {step === 1 && (
            <div className={styles.step}>
              <Head eyebrow="01 — About you" title="Partner information" desc="Who we’ll be working with. If you’re applying on behalf of a business or a small fleet, use the business fields." />
              <div className={styles.row2}>
                <Text label="Full legal name" req err={errors.has('fullName')} value={f.fullName} onChange={(v) => { set('fullName')(v); clearErr('fullName'); }} placeholder="Jordan Ramirez" />
                <Text label="Business name" opt value={f.businessName} onChange={set('businessName')} placeholder="Ramirez Fleet Holdings LLC" />
              </div>
              <Choices label="Partner type" req err={errors.has('partnerType')} value={f.partnerType} onChange={(v) => { set('partnerType')(v); clearErr('partnerType'); }} options={[['individual', 'Individual owner'], ['business', 'Business owner'], ['fleet', 'Fleet operator (3+ vehicles)']]} />
              <div className={styles.row2}>
                <Text label="Email address" req err={errors.has('email')} type="email" value={f.email} onChange={(v) => { set('email')(v); clearErr('email'); }} placeholder="jordan@email.com" />
                <Text label="Phone number" req err={errors.has('phone')} type="tel" value={f.phone} onChange={(v) => { set('phone')(v); clearErr('phone'); }} placeholder="(214) 555-0142" />
              </div>
              <Text label="Mailing address" req err={errors.has('address')} value={f.address} onChange={(v) => { set('address')(v); clearErr('address'); }} placeholder="Street address" />
              <div className={styles.row3}>
                <Text label="City" req err={errors.has('city')} value={f.city} onChange={(v) => { set('city')(v); clearErr('city'); }} />
                <Text label="State" req err={errors.has('state')} value={f.state} onChange={(v) => { set('state')(v.toUpperCase().slice(0, 2)); clearErr('state'); }} />
                <Text label="ZIP" req err={errors.has('zip')} value={f.zip} onChange={(v) => { set('zip')(v); clearErr('zip'); }} placeholder="75201" />
              </div>
              <Select label="How did you hear about CatoDrive?" opt value={f.referral} onChange={set('referral')} options={['Existing CatoDrive renter', 'Another Asset Partner / referral', 'Social media', 'Search engine', 'DFW Airport / hotel signage', 'Other']} />
            </div>
          )}

          {step === 2 && (
            <div className={styles.step}>
              <Head eyebrow="02 — The vehicle" title="Vehicle details" desc="Applying with more than one vehicle? Submit this form for your primary vehicle and list the rest in the notes field at the end — our team will follow up for each one." />
              <div className={styles.row3}>
                <Text label="Year" req err={errors.has('vYear')} value={f.vYear} onChange={(v) => { set('vYear')(v); clearErr('vYear'); }} placeholder="2024" />
                <Text label="Make" req err={errors.has('vMake')} value={f.vMake} onChange={(v) => { set('vMake')(v); clearErr('vMake'); }} placeholder="BMW" />
                <Text label="Model" req err={errors.has('vModel')} value={f.vModel} onChange={(v) => { set('vModel')(v); clearErr('vModel'); }} placeholder="5 Series" />
              </div>
              <div className={styles.row2}>
                <Text label="Trim" opt value={f.vTrim} onChange={set('vTrim')} placeholder="530i M Sport" />
                <Text label="Current mileage" req err={errors.has('vMileage')} type="number" value={f.vMileage} onChange={(v) => { set('vMileage')(v); clearErr('vMileage'); }} placeholder="18,400" />
              </div>
              <div className={styles.row2}>
                <Text label="Exterior color" value={f.vExtColor} onChange={set('vExtColor')} placeholder="Alpine White" />
                <Text label="Interior color" value={f.vIntColor} onChange={set('vIntColor')} placeholder="Cognac" />
              </div>
              <div className={styles.row2}>
                <Text label="VIN" req err={errors.has('vin')} value={f.vin} onChange={(v) => { set('vin')(v.toUpperCase().slice(0, 17)); clearErr('vin'); }} placeholder="17-character VIN" />
                <Text label="License plate / state" req err={errors.has('plate')} value={f.plate} onChange={(v) => { set('plate')(v); clearErr('plate'); }} placeholder="ABC-1234 / TX" />
              </div>
              <p className={styles.hint}>Eligibility guideline: CatoDrive’s fleet is positioned as premium / white-glove, which typically means late-model vehicles with moderate mileage. Exact age and mileage cutoffs are confirmed during vehicle assessment.</p>
            </div>
          )}

          {step === 3 && (
            <div className={styles.step}>
              <Head eyebrow="03 — Ownership" title="Ownership & title" desc="This confirms you’re able to enter into an Asset Partner agreement for this vehicle." />
              <Choices label="Ownership status" req err={errors.has('ownership')} value={f.ownership} onChange={(v) => { set('ownership')(v); clearErr('ownership'); }} options={[['owned', 'Owned free & clear'], ['financed', 'Financed'], ['leased', 'Leased']]} />
              {(f.ownership === 'financed' || f.ownership === 'leased') && (
                <div className={styles.conditional}>
                  <div className={styles.row2}>
                    <Text label="Lienholder / lender name" value={f.lienholder} onChange={set('lienholder')} placeholder="e.g., Chase Auto Finance" />
                    <Text label="Loan / lease account (last 4)" opt value={f.lienAcct} onChange={(v) => set('lienAcct')(v.slice(0, 4))} placeholder="••••1234" />
                  </div>
                  <p className={styles.hint}>If financed or leased, most lenders require written consent before a vehicle is used for commercial rental. CatoDrive will request a lien release or lender consent letter during onboarding.</p>
                </div>
              )}
              <Text label="Estimated current market value" opt value={f.marketValue} onChange={set('marketValue')} placeholder="$38,000" hint="A starting point only — CatoDrive uses an independent valuation guide during assessment." />
            </div>
          )}

          {step === 4 && (
            <div className={styles.step}>
              <Head eyebrow="04 — Condition" title="Vehicle condition" desc="Answer honestly — every vehicle is physically inspected before approval regardless of these answers." />
              <Choices label="Has this vehicle been in an accident?" req err={errors.has('accident')} value={f.accident} onChange={(v) => { set('accident')(v as YN); clearErr('accident'); }} options={[['no', 'No'], ['yes', 'Yes']]} />
              {f.accident === 'yes' && (
                <div className={styles.conditional}>
                  <Textarea label="Briefly describe" value={f.accidentDetail} onChange={set('accidentDetail')} placeholder="Date, extent of damage, and whether it was professionally repaired" />
                </div>
              )}
              <div className={styles.row2}>
                <Choices label="Smoke-free vehicle?" req err={errors.has('smokeFree')} value={f.smokeFree} onChange={(v) => { set('smokeFree')(v as YN); clearErr('smokeFree'); }} options={[['yes', 'Yes'], ['no', 'No']]} />
                <Choices label="Pet-free vehicle?" req err={errors.has('petFree')} value={f.petFree} onChange={(v) => { set('petFree')(v as YN); clearErr('petFree'); }} options={[['yes', 'Yes'], ['no', 'No']]} />
              </div>
              <Choices label="Recent maintenance records available?" value={f.maintRecords} onChange={(v) => set('maintRecords')(v as YN)} options={[['yes', 'Yes'], ['no', 'No']]} />

              <div className={styles.field} style={{ marginTop: 32 }}>
                <label>Vehicle photos <span className={styles.opt}>(optional — you can also email these later)</span></label>
                <div className={styles.uploadGrid}>
                  {PHOTO_SLOTS.map((slot) => {
                    const p = photos[slot];
                    const filled = !!p;
                    return (
                      <label key={slot} className={`${styles.uploadBox} ${filled ? styles.uploadFilled : ''}`}>
                        <input type="file" accept="image/*" onChange={(e) => pickPhoto(slot, e.target.files?.[0])} />
                        <div className={styles.uploadIc}>{p === 'pending' ? '…' : filled ? '✓' : '◈'}</div>
                        <div className={styles.uploadTx}>{slot}</div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className={styles.step}>
              <Head eyebrow="05 — Insurance" title="Current insurance" desc="CatoDrive maintains commercial coverage while your vehicle is active on the platform. We still need your personal policy on file." />
              <div className={styles.row2}>
                <Text label="Insurance carrier" req err={errors.has('insCarrier')} value={f.insCarrier} onChange={(v) => { set('insCarrier')(v); clearErr('insCarrier'); }} placeholder="e.g., State Farm" />
                <Text label="Policy number" req err={errors.has('insPolicy')} value={f.insPolicy} onChange={(v) => { set('insPolicy')(v); clearErr('insPolicy'); }} placeholder="Policy number" />
              </div>
              <Choices
                label="Coverage type" req err={errors.has('coverageType')} value={f.coverageType}
                onChange={(v) => { set('coverageType')(v); clearErr('coverageType'); }}
                options={[['full', 'Full coverage (comprehensive & collision)'], ['liability', 'Liability only'], ['unsure', 'Not sure']]}
                hint="Full coverage (comprehensive and collision) is typically required to list a vehicle as an Asset Partner, since liability-only insurance doesn’t cover damage to the vehicle itself."
              />
              <Text label="Policy expiration date" opt type="date" value={f.insExpiry} onChange={set('insExpiry')} />
            </div>
          )}

          {step === 6 && (
            <div className={styles.step}>
              <Head eyebrow="06 — Preferences & agreement" title="Availability & final details" desc="Last step. Tell us your availability, then confirm the details below." />
              <Choices label="Vehicle availability" req err={errors.has('availability')} value={f.availability} onChange={(v) => { set('availability')(v); clearErr('availability'); }} options={[['fulltime', 'Full-time on the fleet'], ['parttime', 'Part-time / set schedule'], ['seasonal', 'Seasonal only']]} />
              <div className={styles.row2}>
                <Select label="Preferred pickup / delivery zone" opt value={f.zone} onChange={set('zone')} options={['Downtown / Uptown Dallas', 'DFW Airport area', 'Love Field area', 'Fort Worth', 'Plano / Frisco', 'Other DFW area']} />
                <Text label="Target start date" opt type="date" value={f.startDate} onChange={set('startDate')} />
              </div>
              <Textarea label="Notes" opt value={f.notes} onChange={set('notes')} placeholder="Additional vehicles, questions, scheduling constraints" />

              <div style={{ marginTop: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                <Ack checked={f.ackAccurate} onChange={(v) => { set('ackAccurate')(v); clearErr('acks'); }} bold="I certify" rest="that the information provided in this form is true and accurate to the best of my knowledge." />
                <Ack checked={f.ackInspection} onChange={(v) => { set('ackInspection')(v); clearErr('acks'); }} bold="I understand" rest="CatoDrive will conduct an in-person vehicle inspection before final approval, and that submitting this form does not guarantee acceptance into the Asset Partner program." />
                <Ack checked={f.ackTerms} onChange={(v) => { set('ackTerms')(v); clearErr('acks'); }} bold="I have read and agree" rest="to the CatoDrive Asset Partner Program Terms, including vehicle eligibility requirements and revenue-share structure, to be confirmed in writing before onboarding." />
                {errors.has('acks') && <p className={styles.errMsg}>All three acknowledgements are required.</p>}
              </div>

              <div className={styles.row2} style={{ marginTop: 24 }}>
                <Text label="Typed signature (full legal name)" req err={errors.has('signature')} value={f.signature} onChange={(v) => { set('signature')(v); clearErr('signature'); }} placeholder="Type your full name" />
                <Text label="Date" req err={errors.has('signDate')} type="date" value={f.signDate} onChange={(v) => { set('signDate')(v); clearErr('signDate'); }} />
              </div>
            </div>
          )}

          <div className={styles.navRow}>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} style={{ visibility: step === 1 ? 'hidden' : 'visible' }} onClick={goBack}>← Back</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={goNext} disabled={submitting}>
              {submitting ? 'Submitting…' : step === TOTAL_STEPS ? 'Submit application →' : 'Continue →'}
            </button>
          </div>
        </div>
      )}

      {phase === 'confirm' && (
        <div className={styles.confirm}>
          <div className={styles.confirmIc}>✓</div>
          <h2 className={styles.serif}>Application received</h2>
          <p>Thanks — a member of the CatoDrive partnerships team will review your submission and reach out within 2–3 business days to schedule your vehicle assessment.</p>
          <p>Questions in the meantime? Email <a href="mailto:partners@catodrive.com">partners@catodrive.com</a>.</p>
          <div className={`${styles.refnum} ${styles.serif}`}>Reference: {reference}</div>
          <p style={{ marginTop: 28 }}><Link href="/asset-partners" style={{ color: 'var(--brass-bright)' }}>← Back to Asset Partners</Link></p>
        </div>
      )}

      <footer className={styles.footer}>CatoDrive, Inc. · Dallas–Fort Worth, Texas · Asset Partner Program</footer>
    </div>
  );
}

/* ── Field pieces ─────────────────────────────────────────────────── */

function Head({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <div className={styles.stepHead}>
      <div className={styles.stepEyebrow}>{eyebrow}</div>
      <h2 className={styles.serif}>{title}</h2>
      <p>{desc}</p>
    </div>
  );
}

function Text({ label, req, opt, err, type = 'text', value, onChange, placeholder, hint }: {
  label: string; req?: boolean; opt?: boolean; err?: boolean; type?: string;
  value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  return (
    <div className={`${styles.field} ${err ? styles.fieldInvalid : ''}`}>
      <label>{label} {req && <span className={styles.req}>*</span>}{opt && <span className={styles.opt}>(optional)</span>}</label>
      <input className={styles.input} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <p className={styles.hint}>{hint}</p>}
      {err && <p className={styles.errMsg}>Required.</p>}
    </div>
  );
}

function Textarea({ label, opt, value, onChange, placeholder }: {
  label: string; opt?: boolean; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className={styles.field}>
      <label>{label} {opt && <span className={styles.opt}>(optional)</span>}</label>
      <textarea className={styles.textarea} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Select({ label, opt, value, onChange, options }: {
  label: string; opt?: boolean; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className={styles.field}>
      <label>{label} {opt && <span className={styles.opt}>(optional)</span>}</label>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select one…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Choices({ label, req, err, value, onChange, options, hint }: {
  label: string; req?: boolean; err?: boolean; value: string; onChange: (v: string) => void;
  options: [string, string][]; hint?: string;
}) {
  return (
    <div className={`${styles.field} ${err ? styles.fieldInvalid : ''}`}>
      <label>{label} {req && <span className={styles.req}>*</span>}</label>
      <div className={styles.choiceGroup}>
        {options.map(([v, l]) => (
          <label key={v} className={`${styles.choice} ${value === v ? styles.choiceChecked : ''}`}>
            <input type="radio" checked={value === v} onChange={() => onChange(v)} />
            {l}
          </label>
        ))}
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
      {err && <p className={styles.errMsg}>Select an option.</p>}
    </div>
  );
}

function Ack({ checked, onChange, bold, rest }: { checked: boolean; onChange: (v: boolean) => void; bold: string; rest: string }) {
  return (
    <div className={styles.checkRow}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label onClick={() => onChange(!checked)}><b>{bold}</b> {rest}</label>
    </div>
  );
}
