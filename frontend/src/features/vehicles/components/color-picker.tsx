'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Car colour, as swatches.
 *
 * A free-text field produced "white", "White", "pearl white" and "Wht" for the
 * same car, which makes the colour filter useless and the listing look
 * careless. A fixed set stores one canonical value per colour.
 *
 * The palette is the set that actually shows up on rental fleets, in rough
 * order of how common they are — white, black, grey and silver are most of the
 * road, so they come first rather than sitting alphabetically in the middle.
 */
const COLORS: { value: string; label: string; hex: string; ring?: boolean }[] = [
  // `ring` marks colours that would vanish against the card, so they get a
  // border of their own rather than appearing as a hole in the grid.
  { value: 'white', label: 'White', hex: '#FFFFFF', ring: true },
  { value: 'black', label: 'Black', hex: '#111111' },
  { value: 'gray', label: 'Gray', hex: '#8A8D91' },
  { value: 'silver', label: 'Silver', hex: '#C9CCD1', ring: true },
  { value: 'blue', label: 'Blue', hex: '#1D4ED8' },
  { value: 'red', label: 'Red', hex: '#DC2626' },
  { value: 'green', label: 'Green', hex: '#15803D' },
  { value: 'brown', label: 'Brown', hex: '#78503C' },
  { value: 'beige', label: 'Beige', hex: '#D8C3A5', ring: true },
  { value: 'gold', label: 'Gold', hex: '#B48A3C' },
  { value: 'orange', label: 'Orange', hex: '#EA580C' },
  { value: 'yellow', label: 'Yellow', hex: '#EAB308' },
  { value: 'purple', label: 'Purple', hex: '#7C3AED' },
  { value: 'other', label: 'Other', hex: 'conic-gradient(#DC2626,#EAB308,#15803D,#1D4ED8,#7C3AED,#DC2626)' },
];

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = COLORS.find((c) => c.value === value.toLowerCase());

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {COLORS.map((c) => {
          const on = c.value === value.toLowerCase();
          const isGradient = c.hex.startsWith('conic');
          return (
            <button
              key={c.value}
              type="button"
              title={c.label}
              aria-label={c.label}
              aria-pressed={on}
              onClick={() => onChange(c.value)}
              className={cn(
                'relative grid h-9 w-9 place-items-center rounded-full transition-transform',
                // The selection ring sits outside the swatch so it reads on a
                // white swatch as clearly as on a black one.
                on ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:scale-110',
                c.ring && 'ring-1 ring-inset ring-border',
              )}
              style={isGradient ? { background: c.hex } : { backgroundColor: c.hex }}
            >
              {on && (
                <Check
                  className={cn(
                    'h-4 w-4',
                    // Tick contrast follows the swatch, not the theme.
                    ['white', 'silver', 'beige', 'yellow'].includes(c.value) ? 'text-black' : 'text-white',
                  )}
                  strokeWidth={3}
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {selected ? selected.label : 'Pick a colour'}
      </p>
    </div>
  );
}
