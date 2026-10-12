import { create } from 'zustand';
import { EMPTY_CHOICES, type BookingChoices } from '@catodrive/core/web/features/bookings/booking-selection';

/** Stale after an hour, like the website's booking draft: old intent, not a checkout to resume. */
const MAX_AGE_MS = 60 * 60 * 1000;

interface CheckoutState {
  vehicleId: string | null;
  choices: BookingChoices;
  savedAt: number;
  /** Choices for this car, fresh ones if the last were for another car or too old. */
  forVehicle: (vehicleId: string) => BookingChoices;
  set: (vehicleId: string, patch: Partial<BookingChoices>) => void;
  clear: () => void;
}

/**
 * The guest's picks on the car page and checkout. Kept in memory so leaving to
 * sign in, set up the account or verify ID comes back to the same dates and options.
 */
export const useCheckout = create<CheckoutState>((set, get) => ({
  vehicleId: null,
  choices: EMPTY_CHOICES,
  savedAt: 0,
  forVehicle: (vehicleId) => {
    const s = get();
    return s.vehicleId === vehicleId && Date.now() - s.savedAt < MAX_AGE_MS ? s.choices : EMPTY_CHOICES;
  },
  set: (vehicleId, patch) =>
    set((s) => ({
      vehicleId,
      choices: { ...(s.vehicleId === vehicleId && Date.now() - s.savedAt < MAX_AGE_MS ? s.choices : EMPTY_CHOICES), ...patch },
      savedAt: Date.now(),
    })),
  clear: () => set({ vehicleId: null, choices: EMPTY_CHOICES, savedAt: 0 }),
}));
