'use client';

import { Scale, IdCard, Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { TRIGGER_LABEL, VERIFICATION_META } from './shared';
import type { TabProps } from './shared';
import type { PlatformConfig } from '@/features/admin/api';

export function ChecksTab({ draft, set }: TabProps) {
  return (
    <>
        <>
      {/* Legal & eligibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5 text-primary" /> Legal &amp; eligibility</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Terms version" hint="Bump to force every guest to re-accept on their next booking.">
            <Input value={draft.legal.termsVersion}
              onChange={(e) => set((d) => { d.legal.termsVersion = e.target.value; })} />
          </Field>
          <Field label="Terms URL" hint="Where the guest reads the agreement.">
            <Input value={draft.legal.termsUrl}
              onChange={(e) => set((d) => { d.legal.termsUrl = e.target.value; })} />
          </Field>
          <Field label="Privacy policy URL" hint="Linked from the booking agreement and every email.">
            <Input value={draft.legal.privacyUrl}
              onChange={(e) => set((d) => { d.legal.privacyUrl = e.target.value; })} />
          </Field>
          <Field label="Cancellation policy URL" hint="Linked from the cancellation note and cancellation emails.">
            <Input value={draft.legal.cancellationUrl ?? ''} placeholder="/legal"
              onChange={(e) => set((d) => { d.legal.cancellationUrl = e.target.value; })} />
          </Field>
          <Field label="Minimum age" hint="Gates account setup and booking.">
            <Input type="number" min={16} max={99} value={draft.legal.minAgeYears}
              onChange={(e) => set((d) => { d.legal.minAgeYears = Number(e.target.value); })} />
          </Field>
        </CardContent>
      </Card>
        </>
        <>
      {/* Verification services — when each check runs, who runs it, how often */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5 text-primary" /> Verification services</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            When each check fires, which provider runs it, and how long a pass is trusted — all configurable, nothing
            hardcoded. A still-valid result is reused, so a repeat trip never triggers (or pays for) a fresh check.
            E.g. identity once at signup; MVR on the first booking, re-checked every 60 days.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-6 rounded-lg border border-border p-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={draft.contactVerification?.requireEmail ?? true} className="accent-[hsl(var(--primary))]"
                onChange={(e) => set((d) => { d.contactVerification = { requireEmail: e.target.checked, requirePhone: d.contactVerification?.requirePhone ?? true }; })} />
              Guests must confirm their email
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={draft.contactVerification?.requirePhone ?? false} className="accent-[hsl(var(--primary))]"
                onChange={(e) => set((d) => { d.contactVerification = { requireEmail: d.contactVerification?.requireEmail ?? true, requirePhone: e.target.checked }; })} />
              Guests must confirm their mobile number (by SMS, costs per text)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={draft.checkout?.otherMethodsEnabled ?? true} className="accent-[hsl(var(--primary))]"
                onChange={(e) => set((d) => { d.checkout = { otherMethodsEnabled: e.target.checked }; })} />
              Offer Apple Pay, Google Pay, Klarna, Cash App and other Stripe methods at checkout
            </label>
          </div>
          {(['identity', 'mvr', 'background', 'insurance'] as const).map((k) => {
            const meta = VERIFICATION_META[k];
            const pol = draft.verification[k];
            return (
              <div key={k} className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <meta.icon className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold leading-tight">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">{meta.hint}</p>
                    </div>
                  </div>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${pol.required ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                    <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={pol.required}
                      onChange={(e) => set((d) => { d.verification[k].required = e.target.checked; })} />
                    Required to book
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="When it runs">
                    <Select value={pol.trigger}
                      onChange={(e) => set((d) => { d.verification[k].trigger = e.target.value as PlatformConfig['verification']['identity']['trigger']; })}>
                      {Object.entries(TRIGGER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  </Field>
                  <Field label="Provider" hint="Service that runs it.">
                    <Input value={pol.provider}
                      onChange={(e) => set((d) => { d.verification[k].provider = e.target.value; })} />
                  </Field>
                  <Field label="Max / period">
                    <Input type="number" min={0} max={50} value={pol.maxPerPeriod}
                      onChange={(e) => set((d) => { d.verification[k].maxPerPeriod = Number(e.target.value); })} />
                  </Field>
                  <Field label="Period (days)">
                    <Input type="number" min={1} max={3650} value={pol.periodDays}
                      onChange={(e) => set((d) => { d.verification[k].periodDays = Number(e.target.value); })} />
                  </Field>
                  <Field label="Valid (days)">
                    <Input type="number" min={1} max={3650} value={pol.validityDays}
                      onChange={(e) => set((d) => { d.verification[k].validityDays = Number(e.target.value); })} />
                  </Field>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
        </>
    </>
  );
}
