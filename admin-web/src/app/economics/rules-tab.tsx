'use client';

import { Clock, ShieldCheck, Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { toDollars, toCents, toPct, toBps } from './shared';
import type { TabProps } from './shared';

export function RulesTab({ draft, set }: TabProps) {
  return (
    <>
        <>
      {/* Booking timing — how long each stage may wait before it is released */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Booking timing</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            How long a request may wait at each stage. When a clock runs out the booking is released, the card
            authorisation is cancelled and the dates reopen — the guest is never charged.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Host response (hours)" hint="Time a host has to accept a request.">
            <Input type="number" min={1} max={168} value={draft.booking.hostApprovalHours}
              onChange={(e) => set((d) => { d.booking.hostApprovalHours = Number(e.target.value); })} />
          </Field>
          <Field label="Verification window (hours)" hint="Max time a guest has to clear identity after booking.">
            <Input type="number" min={1} max={336} value={draft.booking.verificationGraceHours}
              onChange={(e) => set((d) => { d.booking.verificationGraceHours = Number(e.target.value); })} />
          </Field>
          <Field label="Latest booking (minutes before pickup)" hint="How late a guest may book. A car's own advance notice can only raise this.">
            <Input type="number" min={0} max={10080} value={draft.booking.minLeadMinutes}
              onChange={(e) => set((d) => { d.booking.minLeadMinutes = Number(e.target.value); })} />
          </Field>
          <Field label="Open requests per guest" hint="Requests one guest may have waiting at once.">
            <Input type="number" min={1} max={50} value={draft.booking.maxOpenPendingPerGuest}
              onChange={(e) => set((d) => { d.booking.maxOpenPendingPerGuest = Number(e.target.value); })} />
          </Field>
          <Field label="Licence cutoff (hours before pickup)" hint="Unverified bookings are released this long before pickup.">
            <Input type="number" min={0} max={72} value={draft.booking.verificationCutoffHours}
              onChange={(e) => set((d) => { d.booking.verificationCutoffHours = Number(e.target.value); })} />
          </Field>
          <Field label="Fee when verification lapses ($)" hint="Kept from the card hold if a guest never finishes ID verification and the request expires. 0 = free.">
            <Input type="number" min={0} max={500} step="0.5" value={(draft.booking.verificationLapseFeeCents ?? 0) / 100}
              onChange={(e) => set((d) => { d.booking.verificationLapseFeeCents = Math.round(Number(e.target.value) * 100); })} />
          </Field>
          <Field label="Licence reminder (hours before pickup)" hint="One nudge to unverified guests.">
            <Input type="number" min={1} max={168} value={draft.booking.verificationReminderHours}
              onChange={(e) => set((d) => { d.booking.verificationReminderHours = Number(e.target.value); })} />
          </Field>
          <Field label="Live location opens (minutes before)" hint="Before pickup and before return.">
            <Input type="number" min={5} max={240} value={draft.tracking.approachWindowMinutes}
              onChange={(e) => set((d) => { d.tracking.approachWindowMinutes = Number(e.target.value); })} />
          </Field>
          <Field label="Overdue grace (minutes)" hint="Past the return time before a trip is overdue and late fees start.">
            <Input type="number" min={0} max={720} value={draft.tracking.overdueGraceMinutes}
              onChange={(e) => set((d) => { d.tracking.overdueGraceMinutes = Number(e.target.value); })} />
          </Field>
          <Field label="Return reminders (minutes before)" hint="Comma-separated, up to 4. The guest is reminded to return on time or extend, e.g. 60, 15.">
            <Input value={(draft.tracking.returnReminderMinutes ?? []).join(', ')}
              onChange={(e) => set((d) => { d.tracking.returnReminderMinutes = e.target.value.split(',').map((v) => Math.round(Number(v.trim()))).filter((n) => n > 0).slice(0, 4); })} />
          </Field>
          <Field label="Next booking alert (hours)" hint="A late car whose next booking starts within this many hours alerts the host and staff, and offers that guest a similar car. 0 = off.">
            <Input type="number" min={0} max={168} value={draft.tracking.nextBookingAlertHours ?? 24}
              onChange={(e) => set((d) => { d.tracking.nextBookingAlertHours = Number(e.target.value); })} />
          </Field>
          <Field label="Overdue escalation (hours)" hint="A car this late past its return alerts ops.">
            <Input type="number" min={1} max={336} value={draft.booking.overdueEscalationHours}
              onChange={(e) => set((d) => { d.booking.overdueEscalationHours = Number(e.target.value); })} />
          </Field>
          {draft.identityViewing && (
            <>
              <Field label="Host sees guest photo (minutes before pickup)" hint="The host can see the guest's verified selfie from this long before pickup until the trip starts.">
                <Input type="number" min={0} max={1440} value={draft.identityViewing.hostMinutesBefore}
                  onChange={(e) => set((d) => { d.identityViewing!.hostMinutesBefore = Number(e.target.value); })} />
              </Field>
              <Field label="Host photo view (seconds)" hint="How long the guest's selfie stays open for the host each time.">
                <Input type="number" min={15} max={600} value={draft.identityViewing.hostViewSeconds}
                  onChange={(e) => set((d) => { d.identityViewing!.hostViewSeconds = Number(e.target.value); })} />
              </Field>
              <Field label="Staff ID view (seconds)" hint="How long a guest's licence and selfie stay open for staff each time.">
                <Input type="number" min={30} max={1800} value={draft.identityViewing.adminViewSeconds}
                  onChange={(e) => set((d) => { d.identityViewing!.adminViewSeconds = Number(e.target.value); })} />
              </Field>
            </>
          )}
          {draft.tripDocuments && (
            <>
              <Field label="Vehicle documents view (seconds)" hint="How long the registration and insurance stay open for a guest at a traffic stop.">
                <Input type="number" min={15} max={600} value={draft.tripDocuments.viewSeconds}
                  onChange={(e) => set((d) => { d.tripDocuments!.viewSeconds = Number(e.target.value); })} />
              </Field>
              <Field label="Vehicle documents host alert gap (minutes)" hint="Repeat openings or requests within this gap alert the host only once.">
                <Input type="number" min={0} max={1440} value={draft.tripDocuments.alertCooldownMinutes}
                  onChange={(e) => set((d) => { d.tripDocuments!.alertCooldownMinutes = Number(e.target.value); })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.tripDocuments.enabled}
                  onChange={(e) => set((d) => { d.tripDocuments!.enabled = e.target.checked; })} />
                Guests can open vehicle documents during a trip
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!draft.programs?.rewardsEnabled}
                  onChange={(e) => set((d) => { d.programs = { rewardsEnabled: e.target.checked, referralEnabled: !!d.programs?.referralEnabled, membershipEnabled: !!d.programs?.membershipEnabled }; })} />
                Rewards programme is on (off hides Rewards everywhere; points already earned are kept)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!draft.programs?.membershipEnabled}
                  onChange={(e) => set((d) => { d.programs = { rewardsEnabled: !!d.programs?.rewardsEnabled, referralEnabled: !!d.programs?.referralEnabled, membershipEnabled: e.target.checked }; })} />
                CATO Plus membership is on (off hides it and stops new sign-ups; current members keep their benefits)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.tripDocuments.alertHost}
                  onChange={(e) => set((d) => { d.tripDocuments!.alertHost = e.target.checked; })} />
                Alert the host when the guest opens them
              </label>
            </>
          )}
          <Field label="Expired-document release (hours)" hint="An expired document releases trips starting within this window.">
            <Input type="number" min={1} max={720} value={draft.booking.documentExpiryReleaseHours}
              onChange={(e) => set((d) => { d.booking.documentExpiryReleaseHours = Number(e.target.value); })} />
          </Field>
          <Field label="Daily mileage (miles)" hint="Included per rental day on every car. Saving applies it to all listings at once; hosts set only their per-mile overage fee.">
            <Input type="number" min={1} max={2000} value={draft.booking.dailyMileageMiles ?? 200}
              onChange={(e) => set((d) => { d.booking.dailyMileageMiles = Math.max(1, Math.round(Number(e.target.value) || 1)); })} />
          </Field>
          {draft.trust && (
            <Field label="Who can Instant Book" hint="Everyone else sends a request the host must accept within 24 hours. An unverified guest's card is only held until their ID clears either way.">
              <Select value={draft.trust.perks.instantBookMinTier}
                onChange={(e) => set((d) => { d.trust!.perks.instantBookMinTier = e.target.value as 'new' | 'bronze' | 'silver' | 'gold'; })}>
                <option value="new">Any guest (recommended)</option>
                <option value="bronze">Bronze and up (needs email, phone and ID verified)</option>
                <option value="silver">Silver and up (verified plus completed trips)</option>
                <option value="gold">Gold only</option>
              </Select>
            </Field>
          )}
          <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={draft.booking.recallAutoHold ?? false} className="mt-0.5 accent-[hsl(var(--primary))]" onChange={(e) => set((d) => { d.booking.recallAutoHold = e.target.checked; })} />
            <span>
              Pause a car after its trip when NHTSA lists a recall for its model year
              <span className="block text-xs text-muted-foreground">Off: the host and team are told, the car stays bookable. On: the car is paused and its upcoming trips are released until a repair receipt is verified. The lookup is by model year, not VIN, so it also catches recalls that don’t apply or were already fixed.</span>
            </span>
          </label>
          <Field label="Checkout hold (minutes)" hint="How long dates are held while paying.">
            <Input type="number" min={1} max={120} value={draft.booking.checkoutHoldMinutes}
              onChange={(e) => set((d) => { d.booking.checkoutHoldMinutes = Number(e.target.value); })} />
          </Field>
          <Field label="Payment pending (minutes)" hint="Before an unfinished payment is released.">
            <Input type="number" min={1} max={1440} value={draft.booking.paymentPendingMinutes}
              onChange={(e) => set((d) => { d.booking.paymentPendingMinutes = Number(e.target.value); })} />
          </Field>
          <Field label="Price lock (minutes)" hint="How long a quoted price stays valid.">
            <Input type="number" min={1} max={120} value={draft.booking.priceLockMinutes}
              onChange={(e) => set((d) => { d.booking.priceLockMinutes = Number(e.target.value); })} />
          </Field>
        </CardContent>
      </Card>
        </>
        <>
      {/* Condition photos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Car className="h-5 w-5 text-primary" /> Trip condition photos</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Photos are taken in the app camera only, stamped with time and location, and cannot be changed afterwards.
            These settings decide when they may be taken and how many are required.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Pre-trip opens (minutes before pickup)">
            <Input type="number" min={0} max={1440} value={draft.inspection.preWindowMinutes}
              onChange={(e) => set((d) => { d.inspection.preWindowMinutes = Number(e.target.value); })} />
          </Field>
          <Field label="Return photos open (minutes before return)">
            <Input type="number" min={0} max={1440} value={draft.inspection.postWindowMinutes}
              onChange={(e) => set((d) => { d.inspection.postWindowMinutes = Number(e.target.value); })} />
          </Field>
          <Field label="Pre-trip photos required" hint="0 = not required to start.">
            <Input type="number" min={0} max={30} value={draft.inspection.minPrePhotos}
              onChange={(e) => set((d) => { d.inspection.minPrePhotos = Number(e.target.value); })} />
          </Field>
          <Field label="Return photos required">
            <Input type="number" min={0} max={30} value={draft.inspection.minReturnPhotos}
              onChange={(e) => set((d) => { d.inspection.minReturnPhotos = Number(e.target.value); })} />
          </Field>
          <Field label="Max photos per phase">
            <Input type="number" min={1} max={100} value={draft.inspection.maxPhotosPerPhase}
              onChange={(e) => set((d) => { d.inspection.maxPhotosPerPhase = Number(e.target.value); })} />
          </Field>
          <Field label="Max distance from pickup (metres)" hint="0 = do not check.">
            <Input type="number" min={0} max={100000} value={draft.inspection.maxDistanceMeters}
              onChange={(e) => set((d) => { d.inspection.maxDistanceMeters = Number(e.target.value); })} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.inspection.requireLocation}
              onChange={(e) => set((d) => { d.inspection.requireLocation = e.target.checked; })} />
            Location required on every photo
          </label>
        </CardContent>
      </Card>
        </>
        <>
      {/* Handover rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Handover rules</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            What must happen before the keys change hands. The person handing over inspects the car with the live camera first,
            so a later fine or damage claim has a record to stand on.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.handover.hostInspectionRequired}
              onChange={(e) => set((d) => { d.handover.hostInspectionRequired = e.target.checked; })} />
            Host inspection required before the trip starts
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.handover.pickupCodeRequired}
              onChange={(e) => set((d) => { d.handover.pickupCodeRequired = e.target.checked; })} />
            Guest&apos;s pickup code required
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.handover.hostOnlyStart}
              onChange={(e) => set((d) => { d.handover.hostOnlyStart = e.target.checked; })} />
            Only the host side can start a trip
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.handover.baselineRequiredForCharges}
              onChange={(e) => set((d) => { d.handover.baselineRequiredForCharges = e.target.checked; })} />
            Damage &amp; cleaning charges need pickup photos
          </label>
          <Field label="Wrong pickup-code tries before lock">
            <Input type="number" min={1} max={20} value={draft.handover.maxCodeAttempts}
              onChange={(e) => set((d) => { d.handover.maxCodeAttempts = Number(e.target.value); })} />
          </Field>
          <Field label="Hours for the host to confirm a guest-ended return">
            <Input type="number" min={1} max={168} value={draft.handover.returnConfirmHours}
              onChange={(e) => set((d) => { d.handover.returnConfirmHours = Number(e.target.value); })} />
          </Field>
        </CardContent>
      </Card>
        </>
        <>
      {/* Extensions & swaps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Extensions &amp; swaps</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            When a guest extends into the next guest's booking, the next guest can be moved to a comparable car
            so both trips go ahead.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.extension.enabled}
              onChange={(e) => set((d) => { d.extension.enabled = e.target.checked; })} />
            Guests may extend trips
          </label>
          <Field label="Longest extension (days)">
            <Input type="number" min={1} max={365} value={draft.extension.maxDays}
              onChange={(e) => set((d) => { d.extension.maxDays = Number(e.target.value); })} />
          </Field>
          <Field label="Extend while late (hours)" hint="A guest past the return time can still extend for this long. Late time already passed is charged at the late fee. 0 = no extending once late.">
            <Input type="number" min={0} max={72} value={draft.extension.lateExtendHours ?? 6}
              onChange={(e) => set((d) => { d.extension.lateExtendHours = Number(e.target.value); })} />
          </Field>
          <Field label="Swap the next guest">
            <Select value={draft.extension.swapPolicy}
              onChange={(e) => set((d) => { d.extension.swapPolicy = e.target.value as 'auto' | 'off'; })}>
              <option value="auto">Automatically to a comparable car</option>
              <option value="off">Never - decline the extension</option>
            </Select>
          </Field>
          <Field label="Replacement price tolerance %" hint="How far above or below the original price.">
            <Input type="number" step="0.5" min={0} max={100} value={toPct(draft.extension.swapPriceToleranceBps)}
              onChange={(e) => set((d) => { d.extension.swapPriceToleranceBps = toBps(e.target.value); })} />
          </Field>
          <Field label="Max platform absorbs ($)" hint="When the replacement car costs more.">
            <Input type="number" step="0.01" min={0} value={toDollars(draft.extension.swapMaxAbsorbCents)}
              onChange={(e) => set((d) => { d.extension.swapMaxAbsorbCents = toCents(e.target.value); })} />
          </Field>
        </CardContent>
      </Card>
        </>
    </>
  );
}
