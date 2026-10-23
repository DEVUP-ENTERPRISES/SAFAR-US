'use client';

import { Percent, Clock, ShieldCheck, RotateCcw, Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { toDollars, toCents, toPct, toBps } from './shared';
import type { TabProps } from './shared';

export function FeesTab({ draft, set }: TabProps) {
  return (
    <>
        <>
      {/*
        Service fee — deliberately its own card, not another column in
        Commission. The two are opposite sides of the take rate and confusing
        them is expensive: commission comes OUT of what the host is paid, this
        goes ON TOP of what the guest pays.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" /> Guest service fee
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Charged to the guest on top of the trip and shown as its own line at checkout. Separate
            from commission (on the Commission page), which is taken out of host earnings. Set to 0 to charge no fee.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Service fee %" hint="Percent of the trip subtotal. e.g. 3.5">
            <Input
              type="number"
              step="0.1"
              min={0}
              value={toPct(draft.serviceFee.bps)}
              onChange={(e) => set((d) => { d.serviceFee.bps = toBps(e.target.value); })}
            />
          </Field>
          <Field label="Flat fee per booking ($)" hint="Added to every new booking, on top of the percent. Extensions do not pay it again.">
            <Input
              type="number"
              min={0}
              step="0.25"
              value={(draft.serviceFee.flatCents ?? 0) / 100}
              onChange={(e) => set((d) => { d.serviceFee.flatCents = Math.round(Number(e.target.value) * 100); })}
            />
          </Field>
          <Field label="Cap ($)" hint="Never charge more than this on one trip, fee included. 0 = no cap.">
            <Input
              type="number"
              min={0}
              step="1"
              value={draft.serviceFee.maxCents / 100}
              onChange={(e) => set((d) => { d.serviceFee.maxCents = Math.round(Number(e.target.value) * 100); })}
            />
          </Field>
        </CardContent>
      </Card>
        </>
        <>
      {/* Security deposit — the hold taken before pickup and released after the trip */}
      {draft.deposit && (
        <Card>
          <CardHeader>
            <CardTitle>Security deposit</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">A hold on the guest’s card, not a charge. Placed at pickup (or by the guest from their booking), taken only for evidenced damage, released automatically after the trip.</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={draft.deposit.enabled} className="accent-[hsl(var(--primary))]" onChange={(e) => set((d) => { d.deposit!.enabled = e.target.checked; })} />
              Take a security deposit
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={draft.deposit.requiredAtHandover} className="accent-[hsl(var(--primary))]" onChange={(e) => set((d) => { d.deposit!.requiredAtHandover = e.target.checked; })} />
              The trip cannot start until the deposit is held
            </label>
            <Field label="Minimum ($)"><Input type="number" min={0} value={draft.deposit.minCents / 100} onChange={(e) => set((d) => { d.deposit!.minCents = Math.round(Number(e.target.value) * 100); })} /></Field>
            <Field label="Maximum ($)"><Input type="number" min={0} value={draft.deposit.maxCents / 100} onChange={(e) => set((d) => { d.deposit!.maxCents = Math.round(Number(e.target.value) * 100); })} /></Field>
            <Field label="Times the daily price" hint="2 = two days’ rent, kept between the minimum and maximum"><Input type="number" min={0} step="0.5" value={draft.deposit.multiplierBps / 10000} onChange={(e) => set((d) => { d.deposit!.multiplierBps = Math.round(Number(e.target.value) * 10000); })} /></Field>
            <Field label="Release after the trip (hours)" hint="120 = 5 days"><Input type="number" min={0} max={720} value={draft.deposit.autoReleaseHours} onChange={(e) => set((d) => { d.deposit!.autoReleaseHours = Number(e.target.value); })} /></Field>
            <Field label="Guest can place it this many hours before pickup" hint="Card holds last about 7 days, so keep it under 160"><Input type="number" min={1} max={160} value={draft.deposit.selfServeWindowHours} onChange={(e) => set((d) => { d.deposit!.selfServeWindowHours = Number(e.target.value); })} /></Field>
          </CardContent>
        </Card>
      )}
        </>
        <>
      {/* Cancellations & no-shows — what a guest gets back, and what a host pays for cancelling */}
      {draft.cancellation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-primary" /> Cancellations &amp; no-shows</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Each car uses one of three policies, chosen by its host. A guest who cancels early enough gets everything back;
              later, they get the partial refund. The host earns their share of whatever is kept. A host or CatoDrive
              cancelling always refunds the guest in full.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Cancellation policy for every car" hint="Hosts don’t choose; every car follows this rule. Saving applies it to all listings. Past bookings keep the rule they were booked under.">
              <Select value={draft.booking.cancellationPolicy ?? 'flexible'}
                onChange={(e) => set((d) => { d.booking.cancellationPolicy = e.target.value as 'flexible' | 'moderate' | 'strict'; })}>
                <option value="flexible">Flexible (free until {draft.cancellation.flexible.fullBeforeHours}h before, {toPct(draft.cancellation.flexible.partialBps)}% after)</option>
                <option value="moderate">Moderate (free until {draft.cancellation.moderate.fullBeforeHours}h before, {toPct(draft.cancellation.moderate.partialBps)}% after)</option>
                <option value="strict">Strict (free until {draft.cancellation.strict.fullBeforeHours}h before, {toPct(draft.cancellation.strict.partialBps)}% after)</option>
              </Select>
            </Field>
            {(['flexible', 'moderate', 'strict'] as const).map((p) => {
              const r = draft.cancellation![p];
              const hrs = r.fullBeforeHours;
              const when = hrs % 24 === 0 && hrs > 0 ? `${hrs / 24} day${hrs === 24 ? '' : 's'}` : `${hrs} hours`;
              return (
                <div key={p} className="rounded-lg border border-border p-4">
                  <p className="font-semibold capitalize">{p}</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Full refund if cancelled at least (hours before pickup)">
                      <Input type="number" min={0} max={2160} value={hrs}
                        onChange={(e) => set((d) => { d.cancellation![p].fullBeforeHours = Math.max(0, Math.round(Number(e.target.value))); })} />
                    </Field>
                    <Field label="Otherwise refund %">
                      <Input type="number" min={0} max={100} step="5" value={toPct(r.partialBps)}
                        onChange={(e) => set((d) => { d.cancellation![p].partialBps = Math.min(10000, Math.max(0, toBps(e.target.value))); })} />
                    </Field>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Guests see: full refund if cancelled {when} or more before pickup; after that,{' '}
                    {r.partialBps > 0 ? `${toPct(r.partialBps)}% of the trip back; the service fee is kept` : 'no refund'}.
                  </p>
                </div>
              );
            })}

            {draft.noShow && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Guest no-show: wait (hours)" hint="How long after pickup time before the host can report the guest didn’t come.">
                  <Input type="number" min={0} max={72} value={draft.noShow.graceHours}
                    onChange={(e) => set((d) => { d.noShow!.graceHours = Math.max(0, Math.round(Number(e.target.value))); })} />
                </Field>
                <Field label="Guest no-show: kept %" hint="Share of the trip price kept; the host earns their part of it, the rest is refunded.">
                  <Input type="number" min={0} max={100} step="5" value={toPct(draft.noShow.guestForfeitBps)}
                    onChange={(e) => set((d) => { d.noShow!.guestForfeitBps = Math.min(10000, Math.max(0, toBps(e.target.value))); })} />
                </Field>
              </div>
            )}

            {draft.rebookingProtection && (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <p className="font-semibold">When a host cancels</p>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.rebookingProtection.hostPenalty.enabled} className="accent-[hsl(var(--primary))]"
                    onChange={(e) => set((d) => { d.rebookingProtection!.hostPenalty.enabled = e.target.checked; })} />
                  Charge the host a cancellation fee
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Fee ($)">
                    <Input type="number" min={0} step="1" value={toDollars(draft.rebookingProtection.hostPenalty.flatCents)}
                      onChange={(e) => set((d) => { d.rebookingProtection!.hostPenalty.flatCents = Math.max(0, Math.round(Number(e.target.value) * 100)); })} />
                  </Field>
                  <Field label="Plus % of the booking">
                    <Input type="number" min={0} max={100} step="1" value={toPct(draft.rebookingProtection.hostPenalty.pctOfBookingBps)}
                      onChange={(e) => set((d) => { d.rebookingProtection!.hostPenalty.pctOfBookingBps = Math.min(10000, Math.max(0, toBps(e.target.value))); })} />
                  </Field>
                  <Field label="Free cancellations" hint="Cancellations a host can make without a fee…">
                    <Input type="number" min={0} max={50} value={draft.rebookingProtection.hostPenalty.graceCancellations}
                      onChange={(e) => set((d) => { d.rebookingProtection!.hostPenalty.graceCancellations = Math.max(0, Math.round(Number(e.target.value))); })} />
                  </Field>
                  <Field label="…within this many days">
                    <Input type="number" min={1} max={3650} value={draft.rebookingProtection.hostPenalty.graceWindowDays}
                      onChange={(e) => set((d) => { d.rebookingProtection!.hostPenalty.graceWindowDays = Math.max(1, Math.round(Number(e.target.value))); })} />
                  </Field>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.rebookingProtection.enabled} className="accent-[hsl(var(--primary))]"
                    onChange={(e) => set((d) => { d.rebookingProtection!.enabled = e.target.checked; })} />
                  Cover the price difference when the stranded guest rebooks a similar car
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Cover up to ($ per booking)">
                    <Input type="number" min={0} step="5" value={toDollars(draft.rebookingProtection.maxCoverageCents)}
                      onChange={(e) => set((d) => { d.rebookingProtection!.maxCoverageCents = Math.max(0, Math.round(Number(e.target.value) * 100)); })} />
                  </Field>
                  <Field label="Rebook within (hours)">
                    <Input type="number" min={0} max={720} value={draft.rebookingProtection.windowHours}
                      onChange={(e) => set((d) => { d.rebookingProtection!.windowHours = Math.max(0, Math.round(Number(e.target.value))); })} />
                  </Field>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
        </>
        <>
      {/* Post-trip charges */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Post-trip charges</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Max fuel billed (% points)">
            <Input type="number" min={1} max={100} value={draft.incidentals.maxFuelPercent}
              onChange={(e) => set((d) => { d.incidentals.maxFuelPercent = Number(e.target.value); })} />
          </Field>
          <Field label="Max late hours billed">
            <Input type="number" min={1} value={draft.incidentals.maxLateHours}
              onChange={(e) => set((d) => { d.incidentals.maxLateHours = Number(e.target.value); })} />
          </Field>
          <Field label="Late fee per hour ($)" hint="Each started hour past the grace period, for the first hours below.">
            <Input type="number" min={0} step="0.5" value={toDollars(draft.incidentals.lateReturnPerHourCents ?? 2500)}
              onChange={(e) => set((d) => { d.incidentals.lateReturnPerHourCents = toCents(e.target.value); })} />
          </Field>
          <Field label="Hourly late fee for (hours)" hint="Past this, the car's half-day price is added on top.">
            <Input type="number" min={1} max={24} value={draft.incidentals.lateHourlyMaxHours ?? 6}
              onChange={(e) => set((d) => { d.incidentals.lateHourlyMaxHours = Number(e.target.value); })} />
          </Field>
          <Field label="Half day up to (late hours)" hint="Past this, one full day's price is added per started 24 hours instead of the half day.">
            <Input type="number" min={1} max={48} value={draft.incidentals.lateHalfDayMaxHours ?? 12}
              onChange={(e) => set((d) => { d.incidentals.lateHalfDayMaxHours = Number(e.target.value); })} />
          </Field>
          <Field label="Max total per booking (% of trip)" hint="Ceiling on every host-applied charge combined, except late fees.">
            <Input type="number" step="0.5" value={toPct(draft.incidentals.maxTotalBps)}
              onChange={(e) => set((d) => { d.incidentals.maxTotalBps = toBps(e.target.value); })} />
          </Field>
          <Field label="Guest dispute window (hours)" hint="A host is paid for a charge only after this.">
            <Input type="number" min={1} value={draft.incidentals.disputeWindowHours}
              onChange={(e) => set((d) => { d.incidentals.disputeWindowHours = Number(e.target.value); })} />
          </Field>
        </CardContent>
      </Card>
        </>
        <>
      {/* Protection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Protection plans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.protection.map((p, i) => (
            <div key={p.code} className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
              <Field label="Code"><Input value={p.code} disabled /></Field>
              <Field label="Label">
                <Input value={p.label} onChange={(e) => set((d) => { d.protection[i].label = e.target.value; })} />
              </Field>
              <Field label="Description">
                <Input value={p.description} onChange={(e) => set((d) => { d.protection[i].description = e.target.value; })} />
              </Field>
              <Field label="Price / day ($)">
                <Input type="number" step="0.01" value={toDollars(p.pricePerDay)}
                  onChange={(e) => set((d) => { d.protection[i].pricePerDay = toCents(e.target.value); })} />
              </Field>
            </div>
          ))}
        </CardContent>
      </Card>
        </>
    </>
  );
}
