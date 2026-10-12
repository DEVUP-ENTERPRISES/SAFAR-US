import { esc, printableDocument } from '@catodrive/core';
import type { HostTrip } from '@catodrive/core/web/features/host/trips.api';
import { formatDate, formatDateRange, formatMoney } from '@catodrive/core/web/lib/utils/format';

export interface HostReceiptLine {
  label: string;
  value: string;
  sign?: '-' | '+';
}

/** The receipt figures, from the trip's breakdown or, on an older backend, just the host's earnings. */
export function hostReceipt(t: HostTrip) {
  const hasBreakdown = !!t.receipt;
  const r = t.receipt ?? {
    issuedAt: t.period.start,
    days: 0,
    base: 0,
    cleaningFee: 0,
    delivery: 0,
    protection: 0,
    protectionPlan: undefined as string | undefined,
    discount: 0,
    subtotal: t.earnings,
    commission: 0,
    tax: 0,
    hostEarnings: t.earnings,
    total: t.earnings,
  };
  const m = (n: number) => formatMoney({ amount: n, currency: t.currency });
  const guest: HostReceiptLine[] = hasBreakdown
    ? [
        { label: `Rental · ${r.days} day${r.days === 1 ? '' : 's'}`, value: m(r.base) },
        ...(r.cleaningFee > 0 ? [{ label: 'Cleaning fee', value: m(r.cleaningFee) }] : []),
        ...(r.delivery > 0 ? [{ label: 'Delivery', value: m(r.delivery) }] : []),
        ...(r.protection > 0 ? [{ label: `Protection${r.protectionPlan ? ` · ${r.protectionPlan}` : ''}`, value: m(r.protection) }] : []),
        ...(r.discount > 0 ? [{ label: 'Discounts', value: m(r.discount), sign: '-' as const }] : []),
        ...(r.tax > 0 ? [{ label: 'Tax collected', value: m(r.tax) }] : []),
      ]
    : [];
  const payout: HostReceiptLine[] = hasBreakdown
    ? [
        { label: 'Trip subtotal', value: m(r.subtotal) },
        { label: 'Platform commission', value: m(r.commission), sign: '-' },
      ]
    : [];
  return { hasBreakdown, r, m, guest, payout, paid: ['paid', 'confirmed', 'in_progress', 'completed'].includes(t.status) };
}

const row = (l: HostReceiptLine) => `<tr><td>${esc(l.label)}</td><td class="r">${l.sign === '-' ? '−' : l.sign === '+' ? '+' : ''}${esc(l.value)}</td></tr>`;

/** The website's host trip receipt as printable HTML. */
export function hostReceiptHtml(t: HostTrip, verifyUrl: string): string {
  const { hasBreakdown, r, m, guest, payout, paid } = hostReceipt(t);
  return printableDocument(`
    <p class="k">CatoDrive · Trip receipt</p><h1>${esc(t.code)}</h1>
    <p class="muted">Issued ${esc(formatDate(r.issuedAt))} · ${esc(paid ? 'Paid' : t.status.replace(/_/g, ' '))}</p>
    <section>
      <p>${esc(`${t.vehicle.make} ${t.vehicle.model} ${t.vehicle.year}`)}${t.vehicle.plate ? ` · ${esc(t.vehicle.plate)}` : ''}</p>
      <p>${esc(formatDateRange(t.period.start, t.period.end))}${hasBreakdown ? ` · ${r.days} day${r.days === 1 ? '' : 's'}` : ''}</p>
      <p>Guest: ${esc(t.guest.name)} <span class="muted">· Guest ID ${esc(t.guest._id.slice(0, 8))}</span></p>
    </section>
    ${hasBreakdown ? `<section><p class="k">Guest charges</p><table>${guest.map(row).join('')}<tr class="t"><td>Guest total</td><td class="r">${esc(m(r.total))}</td></tr></table></section>` : ''}
    <section>${hasBreakdown ? `<p class="k">Your payout</p>` : ''}<table>${payout.map(row).join('')}<tr class="t"><td>Your earnings</td><td class="r">${esc(m(r.hostEarnings))}</td></tr></table></section>
    <p class="muted">Booking ID · ${esc(t.bookingId)}</p>
    <p class="muted">Issued by CatoDrive. Figures are the price locked at booking and never change afterward. Any refundable security deposit is authorised separately and not included here. Confirm this receipt is genuine at ${esc(verifyUrl)}</p>
  `);
}
