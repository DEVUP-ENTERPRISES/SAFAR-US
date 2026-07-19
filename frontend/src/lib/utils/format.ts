import type { Money } from '@/lib/api/types';

/** Backend money is integer minor units + ISO currency. Render as currency. */
export function formatMoney(m: Money | undefined | null): string {
  if (!m) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: m.currency,
      maximumFractionDigits: 0,
    }).format(m.amount / 100);
  } catch {
    return `${(m.amount / 100).toFixed(0)} ${m.currency}`;
  }
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateRange(start: string | Date, end: string | Date): string {
  return `${formatDate(start)} → ${formatDate(end)}`;
}
