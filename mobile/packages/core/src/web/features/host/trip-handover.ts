// Generated from frontend/src/features/host/trip-handover.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import type { HostTrip } from './trips.api';

export type StepStatus = 'done' | 'active' | 'locked' | 'na';

/** Plain message and the checklist step to send the host back to, per start error code. */
export const START_ERRORS: Record<string, { text: string; step?: string }> = {
  HOST_ONLY_START: { text: 'Only the host can start this trip, at pickup. Refresh the page and try again.' },
  HOST_INSPECTION_REQUIRED: { text: 'Take the pickup photos of the car before starting the trip.', step: 'handover-inspect' },
  GUEST_NOT_VERIFIED: { text: 'This guest has not finished identity verification. Ask them to complete it in their app, or contact support.' },
  LICENCE_EXPIRES_DURING_TRIP: { text: 'The guest’s licence expires before the trip ends, so they cannot drive it. Contact support.' },
  PICKUP_CODE_REQUIRED: { text: 'Enter the guest’s pickup code before starting the trip.', step: 'handover-code' },
  ODOMETER_REQUIRED: { text: 'Enter the starting odometer reading.', step: 'handover-odo' },
};

export const TRIP_FINISHED = ['completed', 'cancelled', 'cancelled_guest', 'cancelled_host', 'cancelled_system', 'declined', 'expired'];

/** The trip page's heading for each booking state. */
export function tripHeading(status: string): string {
  if (status === 'pending_approval') return 'Booking request';
  if (status === 'completed') return 'Completed trip';
  if (status === 'expired') return 'Expired booking';
  if (status === 'declined') return 'Declined request';
  if (TRIP_FINISHED.includes(status)) return 'Cancelled booking';
  if (status === 'in_progress') return 'Trip in progress';
  return 'Booked trip';
}

/**
 * The pickup checklist: which steps apply, which are done, and what the host
 * must do next. The per-trip payload wins, then the public config; unknown
 * means the server decides.
 */
export function handoverGates(
  t: HostTrip,
  cfgHandover: { hostInspectionRequired?: boolean; pickupCodeRequired?: boolean } | undefined,
  odoStart: string,
) {
  const hv = t.handover;
  const inspectRequired = hv?.requirements?.hostInspectionRequired ?? cfgHandover?.hostInspectionRequired ?? false;
  const codeRequired = hv?.requirements?.pickupCodeRequired ?? cfgHandover?.pickupCodeRequired ?? false;
  const insp = hv?.inspection;
  const inspectDone = !inspectRequired || (insp ? insp.taken >= insp.required : (t.photoCount ?? 0) > 0);
  const guestVerified = hv ? hv.guestVerified : (t.guest.verification?.verified ?? true);
  const licenceExpired = (hv?.licenceValidThroughTrip ?? t.guest.verification?.licenceValidThroughTrip) === false;
  const verifyDone = guestVerified && !licenceExpired;
  const codeDone = !codeRequired || !!t.pickupVerified || !!hv?.pickupVerified;
  const odoDone = odoStart !== '' && Number(odoStart) >= 0;
  const canStart = inspectDone && verifyDone && codeDone && odoDone;
  const stepStatus = (done: boolean, prevDone: boolean, na = false): StepStatus =>
    na ? 'na' : done ? 'done' : prevDone ? 'active' : 'locked';
  const blocker = canStart
    ? null
    : !inspectDone
      ? 'Take the pickup photos to continue.'
      : !verifyDone
        ? (licenceExpired ? 'The guest’s licence expires before the trip ends. Contact support.' : 'The guest hasn’t finished ID verification yet. Ask them to complete it in the app.')
        : !codeDone
          ? 'Enter the guest’s pickup code to continue.'
          : 'Enter the starting odometer to start the trip.';
  return {
    insp,
    inspectDone,
    codeDone,
    canStart,
    blocker,
    codeLocked: !!hv?.codeLocked,
    sInspect: stepStatus(inspectDone, true, !inspectRequired),
    sCode: stepStatus(codeDone, inspectDone && verifyDone, !codeRequired),
    sOdo: stepStatus(odoDone, inspectDone && verifyDone && codeDone),
  };
}
