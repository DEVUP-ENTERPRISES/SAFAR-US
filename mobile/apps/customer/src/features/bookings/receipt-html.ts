import type { BookingReceipts, Receipt } from '@catodrive/core/web/features/bookings/api';
import { formatDate, formatDateRange, formatMoney } from '@catodrive/core/web/lib/utils/format';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#16130e;padding:24px;}
    h1{margin:0 0 4px;font-size:24px} h2{margin:0 0 6px;font-size:18px}
    .k{text-transform:uppercase;letter-spacing:2px;font-size:11px;color:#0e9090;margin:0 0 4px}
    .muted{color:#6f675d;font-size:13px} section{border:1px solid #e2ddd4;border-radius:14px;padding:16px;margin:16px 0}
    table{width:100%;border-collapse:collapse;margin-top:10px} td{padding:6px 0;font-size:14px} .r{text-align:right}
    tr.t td{border-top:1px solid #e2ddd4;font-weight:700;padding-top:10px}
  </style></head><body>
    <p class="k">Booking</p><h1>${esc(opts.code)}</h1>
    ${opts.vehicle ? `<p>${esc(opts.vehicle)}</p>` : ''}
    <p>${esc(formatDateRange(data.summary.period.start, data.summary.period.end))}</p>
    <p class="muted">Issued ${esc(formatDate(opts.createdAt))} · ${esc(opts.status.replace(/_/g, ' '))}</p>
    ${list.map((r) => card(r, data.currency, opts.paid)).join('')}
    ${summary}
    <p class="muted">Issued by CatoDrive. Any refundable security deposit is authorised separately and is not included in these totals.</p>
  </body></html>`;
}
