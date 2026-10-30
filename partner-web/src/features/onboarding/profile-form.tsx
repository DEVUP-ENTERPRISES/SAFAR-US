'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { assetPartnerApi, type PartnerContact, type PartnerProfile, type Residency } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';

const blank = (): PartnerContact => ({ name: '', phone: '', relation: '', email: '' });
const digits = (s: string) => s.replace(/\D/g, '');

function ContactFields({ id, value, onChange, legend }: { id: string; value: PartnerContact; onChange: (c: PartnerContact) => void; legend: string }) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <legend className="sr-only">{legend}</legend>
      <Field label="Full name" htmlFor={`${id}-name`}>
        <Input id={`${id}-name`} autoComplete="off" maxLength={120} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </Field>
      <Field label="How they’re related to you" htmlFor={`${id}-rel`} hint="For example: spouse, sister, friend">
        <Input id={`${id}-rel`} maxLength={60} value={value.relation} onChange={(e) => onChange({ ...value, relation: e.target.value })} />
      </Field>
      <Field label="Phone" htmlFor={`${id}-phone`}>
        <Input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="off" maxLength={30} value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
      </Field>
      <Field label="Email (optional)" htmlFor={`${id}-email`}>
        <Input id={`${id}-email`} type="email" autoComplete="off" maxLength={160} value={value.email ?? ''} onChange={(e) => onChange({ ...value, email: e.target.value })} />
      </Field>
    </fieldset>
  );
}

/** Who to call if CatoDrive can't reach the partner; used before signing and on the profile page. */
export function ProfileForm({ initial, ownPhone, submitLabel = 'Save and continue', onSaved }: { initial?: Partial<PartnerProfile>; ownPhone?: string; submitLabel?: string; onSaved: () => void }) {
  const [contacts, setContacts] = useState<PartnerContact[]>(initial?.emergencyContacts?.length ? initial.emergencyContacts : [blank()]);
  const [hasRep, setHasRep] = useState(!!initial?.representative);
  const [rep, setRep] = useState<PartnerContact>(initial?.representative ?? blank());
  const [residency, setResidency] = useState<Residency | ''>(initial?.residency ?? '');
  const [visaExpiry, setVisaExpiry] = useState(initial?.visaExpiry ? initial.visaExpiry.slice(0, 10) : '');
  const [preferred, setPreferred] = useState<'call' | 'text' | 'email' | ''>(initial?.preferredContact ?? '');
  const [local, setLocal] = useState<string>();

  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      assetPartnerApi.saveProfile({
        emergencyContacts: contacts.map((c) => ({ ...c, email: c.email?.trim() || undefined })),
        representative: hasRep ? { ...rep, email: rep.email?.trim() || undefined } : null,
        residency: residency as Residency,
        visaExpiry: residency === 'visa' ? visaExpiry : undefined,
        preferredContact: preferred || undefined,
      }),
    onSuccess: onSaved,
  });

  const submit = () => {
    setLocal(undefined);
    const own = digits(ownPhone ?? '').slice(-10);
    if (contacts.some((c) => c.name.trim().length < 2 || digits(c.phone).length < 10 || c.relation.trim().length < 2)) return setLocal('Fill in each contact’s name, relation and phone number with area code.');
    if (own && contacts.some((c) => digits(c.phone).slice(-10) === own)) return setLocal('Your emergency contact needs a phone number other than your own.');
    if (!residency) return setLocal('Tell us your residency status.');
    if (residency === 'visa' && !visaExpiry) return setLocal('Enter the date your visa ends.');
    save.mutate();
  };

  const error = local ?? (save.isError ? (save.error instanceof ApiError ? save.error.message : 'We couldn’t save that. Try again.') : undefined);

  return (
    <Card>
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">Who should we call if we can’t reach you?</h2>
            <p className="text-sm text-muted-foreground">We only use these if something happens to your car and we can’t get hold of you. We never share them.</p>
          </div>
        </div>

        <section className="space-y-4" aria-label="Emergency contacts">
          {contacts.map((c, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-label font-semibold">Emergency contact {contacts.length > 1 ? i + 1 : ''}</h3>
                {contacts.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} aria-label={`Remove emergency contact ${i + 1}`}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
              <ContactFields id={`ec-${i}`} legend={`Emergency contact ${i + 1}`} value={c} onChange={(next) => setContacts(contacts.map((x, j) => (j === i ? next : x)))} />
            </div>
          ))}
          {contacts.length < 3 && (
            <Button variant="outline" size="sm" onClick={() => setContacts([...contacts, blank()])}>
              <Plus className="h-4 w-4" /> Add another contact
            </Button>
          )}
        </section>

        <section className="space-y-3">
          <Field label="Your residency status" htmlFor="residency" hint="If you’re on a visa, we’ll check in before it ends so your car is looked after if you have to travel.">
            <Select id="residency" value={residency} onChange={(e) => setResidency(e.target.value as Residency)}>
              <option value="" disabled>Choose one</option>
              <option value="citizen">U.S. citizen</option>
              <option value="permanent_resident">Permanent resident (green card)</option>
              <option value="visa">On a visa</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          {residency === 'visa' && (
            <Field label="Date your visa ends" htmlFor="visa-expiry">
              <Input id="visa-expiry" type="date" value={visaExpiry} onChange={(e) => setVisaExpiry(e.target.value)} />
            </Field>
          )}
          <Field label="Best way to reach you" htmlFor="preferred">
            <Select id="preferred" value={preferred} onChange={(e) => setPreferred(e.target.value as 'call' | 'text' | 'email')}>
              <option value="">No preference</option>
              <option value="call">Phone call</option>
              <option value="text">Text message</option>
              <option value="email">Email</option>
            </Select>
          </Field>
        </section>

        <section className="space-y-3 rounded-lg border border-border p-4">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={hasRep} onChange={(e) => setHasRep(e.target.checked)} />
            <span>
              <span className="font-semibold">Name someone who can decide about your car for you</span>
              <span className="block text-muted-foreground">Optional. If we can’t reach you for a long time, this person can take the car back or tell us what to do with it.</span>
            </span>
          </label>
          {hasRep && <ContactFields id="rep" legend="Representative" value={rep} onChange={setRep} />}
        </section>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button className="w-full sm:w-auto" loading={save.isPending} onClick={submit}>{submitLabel}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
