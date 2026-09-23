'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Vehicle features, as a checklist rather than free text.
 *
 * A comma-separated field produced "gps", "GPS", "Gps navigation" for the same
 * feature, which makes the amenity filter useless. Grouped to match how a
 * guest actually scans a listing — safety first, then what's in the cabin.
 */
const GROUPS: { label: string; items: { value: string; label: string }[] }[] = [
  {
    label: 'Safety',
    items: [
      { value: 'backup_camera', label: 'Backup camera' },
      { value: 'blind_spot_warning', label: 'Blind spot warning' },
    ],
  },
  {
    label: 'Convenience',
    items: [
      { value: 'bluetooth', label: 'Bluetooth' },
      { value: 'gps', label: 'GPS' },
      { value: 'keyless_entry', label: 'Keyless entry' },
      { value: 'usb_charger', label: 'USB charger' },
      { value: 'usb_input', label: 'USB input' },
      { value: 'aux_input', label: 'AUX input' },
      { value: 'toll_pass', label: 'Toll pass' },
      { value: 'sunroof', label: 'Sunroof' },
      { value: 'android_auto', label: 'Android Auto' },
      { value: 'apple_carplay', label: 'Apple CarPlay' },
    ],
  },
  // No pet option — pets are not permitted on any CatoDrive trip.
  {
    label: 'Family',
    items: [{ value: 'child_seat', label: 'Child seat' }],
  },
  {
    label: 'Adventure',
    items: [
      { value: 'bike_rack', label: 'Bike rack' },
      { value: 'ski_rack', label: 'Ski rack' },
      { value: 'snow_tires', label: 'Snow tires' },
    ],
  },
  {
    label: 'Accessibility',
    items: [{ value: 'wheelchair_accessible', label: 'Wheelchair accessible' }],
  },
];
const KNOWN = new Set(GROUPS.flatMap((g) => g.items.map((i) => i.value)));

export function FeaturePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [customInput, setCustomInput] = useState('');
  const custom = value.filter((v) => !KNOWN.has(v));

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const addCustom = () => {
    const v = customInput.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setCustomInput('');
  };

  return (
    <div className="space-y-5">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{g.label}</p>
          <div className="flex flex-wrap gap-2">
            {g.items.map((item) => {
              const on = value.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(item.value)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/60 bg-card hover:border-border',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Custom features</p>
        {custom.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {custom.map((c) => (
              <span
                key={c}
                className="flex items-center gap-1.5 rounded-full border border-primary bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground"
              >
                {c}
                <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(value.filter((v) => v !== c))}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="e.g. Roof box"
            className="h-9 min-w-0 flex-1 rounded-full border border-border/60 bg-card px-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
          />
          <button
            type="button"
            onClick={addCustom}
            className="flex h-9 items-center gap-1 rounded-full border border-border/60 px-3 text-sm font-medium hover:border-border"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>
    </div>
  );
}
