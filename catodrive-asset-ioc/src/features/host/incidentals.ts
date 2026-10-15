import { api } from '@/lib/api/client';

export type IncidentalKind = 'fuel' | 'cleaning' | 'smoking' | 'pet' | 'late_return' | 'toll' | 'fine' | 'other';

/** Types priced by admin config vs types where the host names the amount. */
export const RATED: Record<string, { label: string; unit?: string }> = {
  cleaning: { label: 'Extra cleaning' },
  smoking: { label: 'Smoked in the car' },
  pet: { label: 'Unapproved pet' },
  fuel: { label: 'Fuel shortfall', unit: '% of tank' },
  late_return: { label: 'Late return', unit: 'hours late' },
};

export const FREEFORM: Record<string, string> = {
  toll: 'Toll',
  fine: 'Fine',
  other: 'Other',
};

export interface IncidentalLine { type: IncidentalKind; qty?: number; amount?: number; note: string }

export const NEW_INCIDENTAL: IncidentalLine = { type: 'cleaning', note: '' };

export const isFreeform = (t: IncidentalKind) => t in FREEFORM;

/** Freeform charges need an amount and a real explanation; rated ones with a unit need a quantity. */
export const incidentalsValid = (lines: IncidentalLine[]) =>
  lines.every((l) =>
    isFreeform(l.type)
      ? (l.amount ?? 0) > 0 && l.note.trim().length >= 10
      : RATED[l.type]?.unit
        ? (l.qty ?? 0) > 0
        : true,
  );

export const applyIncidentals = (bookingId: string, lines: IncidentalLine[]) =>
  api.post(`/bookings/${bookingId}/incidentals`, {
    items: lines.map((l) => ({
      type: l.type,
      ...(l.qty ? { qty: l.qty } : {}),
      ...(l.amount ? { amount: Math.round(l.amount * 100) } : {}),
      note: l.note.trim() || undefined,
    })),
  });
