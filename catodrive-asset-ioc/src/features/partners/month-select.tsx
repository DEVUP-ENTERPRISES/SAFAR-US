'use client';

import { Select } from '@/components/ui/select';

export function monthOptions(n: number, includeCurrent: boolean): { value: string; label: string }[] {
  const now = new Date();
  const offset = includeCurrent ? 0 : 1;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { value, label: includeCurrent && i === 0 ? `${label} (so far)` : label };
  });
}

export function MonthSelect({ months, value, onChange }: { months: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select size="sm" wrapperClassName="w-full sm:w-56" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Month">
      {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </Select>
  );
}
