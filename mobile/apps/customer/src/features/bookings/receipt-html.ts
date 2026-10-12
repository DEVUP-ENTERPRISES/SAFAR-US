import type { BookingReceipts, Receipt } from '@catodrive/core/web/features/bookings/api';
import { esc, printableDocument } from '@catodrive/core';
import { formatDate, formatDateRange, formatMoney } from '@catodrive/core/web/lib/utils/format';

function card(r: Receipt, currency: string, paid: boolean): string {
  const m = (amount: number) => formatMoney({ amount: Math.abs(amount), currency });
  const lines = r.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${l.amount < 0 ? '−' : ''}${m(l.amount)}</td></tr>`).join('');
  return `<section>
    <p class="k">${r.kind === 'original' ? 'Receipt' : 'Extension receipt'}</p>
    <h2>${esc(r.receiptNo)}</h2>
    <p>${esc(formatDateRange(r.period.start, r.period.end))}</p>
    <p class="muted">Issued ${esc(formatDate(r.issuedAt))}${r.paymentRef ? ` · Payment ref ${esc(r.paymentRef)}` : ''}</p>
    <table>${lines}<tr class="t"><td>${paid ? 'Total paid' : 'Total due'}</td><td class="r">${formatMoney(r.total)}</td></tr></table>
  </section>`;
}

/** The website's printable receipt, as HTML for the phone's print / save-as-PDF sheet. */
export function receiptHtml(data: BookingReceipts, opts: { code: string; status: string; vehicle?: string; createdAt: string; paid: boolean; only?: string | null }): string {
  const list = opts.only ? data.receipts.filter((r) => r.receiptNo === opts.only) : data.receipts;
  const summary =
    !opts.only && data.receipts.length > 1
      ? `<section><p class="k">Final summary · ${data.summary.days} days</p><table>${data.receipts
          .map((r) => `<tr><td>${esc(r.receiptNo)} · ${r.kind === 'original' ? 'Original booking' : 'Extension'}</td><td class="r">${formatMoney(r.total)}</td></tr>`)
          .join('')}<tr class="t"><td>${opts.paid ? 'Total paid' : 'Total due'}</td><td class="r">${formatMoney(data.summary.total)}</td></tr></table></section>`
      : '';
  return printableDocument(`
    <p class="k">Booking</p><h1>${esc(opts.code)}</h1>
    ${opts.vehicle ? `<p>${esc(opts.vehicle)}</p>` : ''}
    <p>${esc(formatDateRange(data.summary.period.start, data.summary.period.end))}</p>
    <p class="muted">Issued ${esc(formatDate(opts.createdAt))} · ${esc(opts.status.replace(/_/g, ' '))}</p>
    ${list.map((r) => card(r, data.currency, opts.paid)).join('')}
    ${summary}
    <p class="muted">Issued by CatoDrive. Any refundable security deposit is authorised separately and is not included in these totals.</p>
  `);
}
