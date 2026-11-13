import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { PartnerStatement } from './asset-partner-statement.service';

export interface LedgerTrip {
  start: Date;
  end: Date;
  where: string;
  gross: number;
}

export interface LedgerVehicle {
  vehicleId: string;
  label: string;
  plate?: string;
  trips: LedgerTrip[];
}

const NAVY = rgb(0.114, 0.227, 0.38);
const GOLD = rgb(0.784, 0.588, 0.243);
const GREEN = rgb(0.086, 0.5, 0.35);
const RED = rgb(0.75, 0.2, 0.2);
const INK = rgb(0.13, 0.15, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const TILE = rgb(0.945, 0.953, 0.965);
const ZEBRA = rgb(0.973, 0.976, 0.98);
const W = 612;
const H = 792;
const M = 40;

const usd = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;
const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
const long = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// The standard PDF font draws Latin-1 only; anything else would make the whole render fail.
const safe = (t: string) => t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF•]/g, '');

function fit(font: PDFFont, text: string, size: number, max: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > max) t = t.slice(0, -1);
  return `${t}...`;
}

/** The monthly partner report, built from the live statement so nobody has to assemble it by hand. */
export async function buildStatementPdf(input: { partnerName: string; statement: PartnerStatement; vehicles: LedgerVehicle[]; generatedAt?: Date }): Promise<Buffer> {
  const { statement: s, vehicles } = input;
  const now = input.generatedAt ?? new Date();
  const doc = await PDFDocument.create();
  doc.setProducer('CatoDrive');
  doc.setCreator('CatoDrive');
  doc.setTitle(`CatoDrive statement ${s.period}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const text = (t: string, x: number, yy: number, size: number, f = font, color = INK) => page.drawText(safe(t), { x, y: yy, size, font: f, color });
  const right = (t: string, xr: number, yy: number, size: number, f = font, color = INK) => text(t, xr - f.widthOfTextAtSize(safe(t), size), yy, size, f, color);
  const footer = () => {
    const f = 'CatoDrive  •  Confidential partner report';
    text(f, (W - font.widthOfTextAtSize(f, 8)) / 2, 24, 8, font, MUTED);
  };
  const ensure = (needed: number) => {
    if (y - needed >= 48) return;
    footer();
    page = doc.addPage([W, H]);
    y = H - M;
  };

  // Header.
  text('Cato', M, y - 20, 22, bold, NAVY);
  text('Drive', M + bold.widthOfTextAtSize('Cato', 22), y - 20, 22, bold, GOLD);
  right(`Report date: ${long.format(now)}`, W - M, y - 14, 9, font, MUTED);
  y -= 30;
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: 2, color: GOLD });
  y -= 30;

  const [yy, mm] = s.period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const monthName = monthYear.format(new Date(Date.UTC(yy, mm - 1, 1)));
  text(`Monthly Activity Report - ${monthName}`, M, y, 20, bold, NAVY);
  y -= 16;
  text(`Asset Partner: ${input.partnerName}  •  Period: ${monthName.split(' ')[0]} 1 - ${lastDay}, ${yy}  •  ${s.final ? 'Final' : 'Month still running'}`, M, y, 9, font, MUTED);
  y -= 18;

  // Summary tiles.
  const feeBps = s.managementFeeBpsUsed.length === 1 ? s.managementFeeBpsUsed[0] : s.terms.managementFeeBps;
  const feeLabel = s.managementFeeBpsUsed.length > 1 ? `CatoDrive fee (${s.managementFeeBpsUsed.map(pct).join(' / ')})` : `CatoDrive fee (${pct(feeBps)})`;
  const net = s.totals.gross - s.totals.managementFee;
  const tiles: [string, string, string, typeof INK][] = [
    [usd(s.totals.gross), 'Gross revenue', 'Completed trips this month', NAVY],
    [usd(-s.totals.managementFee), feeLabel, 'Management commission', RED],
    [usd(net), 'Net before deductions', `${pct(10_000 - feeBps)} share`, GREEN],
    [String(s.lines.length), 'Vehicles', 'In the program this month', NAVY],
    [String(s.totals.trips), 'Total trips', 'Completed bookings', NAVY],
    [usd(s.totals.net), 'Final net to partner', 'After all deductions', GREEN],
  ];
  const tw = (W - 2 * M - 16) / 3;
  const th = 62;
  tiles.forEach(([value, label, sub, color], i) => {
    const x = M + (i % 3) * (tw + 8);
    const top = y - Math.floor(i / 3) * (th + 8);
    page.drawRectangle({ x, y: top - th, width: tw, height: th, color: TILE });
    text(value, x + 10, top - 24, 17, bold, color);
    text(fit(bold, label, 9, tw - 20), x + 10, top - 40, 9, bold);
    text(fit(font, sub, 8, tw - 20), x + 10, top - 52, 8, font, MUTED);
  });
  y -= 2 * th + 8 + 26;

  // Deductions table.
  const rows: [string, number, boolean][] = [[`Net rental income (after ${pct(feeBps)} commission)`, net, false]];
  if (s.totals.insurance) rows.push(['Less: Fleet insurance', -s.totals.insurance, false]);
  if (s.totals.detailing) rows.push(['Less: Car wash and detailing', -s.totals.detailing, false]);
  if (s.totals.repairs) rows.push(['Less: Repairs', -s.totals.repairs, false]);
  if (s.totals.noticeRefunds) rows.push(['Plus: Tolls and tickets you paid, refunded', s.totals.noticeRefunds, false]);
  if (s.totals.registrationFee) rows.push(['Less: Registration fee, from earnings', -s.totals.registrationFee, false]);
  rows.push(['Net to partner after operating costs', s.totals.net, true]);
  text('Net to partner after operating costs', M, y, 11, bold, NAVY);
  y -= 8;
  page.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 18, color: NAVY });
  text('Line item', M + 8, y - 13, 9, bold, rgb(1, 1, 1));
  right('Amount', W - M - 8, y - 13, 9, bold, rgb(1, 1, 1));
  y -= 18;
  rows.forEach(([label, amount, total], i) => {
    if (i % 2 === 1 || total) page.drawRectangle({ x: M, y: y - 20, width: W - 2 * M, height: 20, color: total ? TILE : ZEBRA });
    text(label, M + 8, y - 14, 9, total ? bold : font);
    right(usd(amount), W - M - 8, y - 14, 9, total ? bold : font, amount < 0 ? RED : INK);
    y -= 20;
  });
  y -= 16;
  const paidLine = s.paid
    ? `Paid ${usd(s.paid.amount)} on ${long.format(new Date(s.paid.paidAt))} by ${s.paid.method === 'zelle' ? 'Zelle' : s.paid.method}${s.paid.reference ? ` (ref ${s.paid.reference})` : ''}.`
    : s.totals.net > 0
      ? `Payout due ${long.format(new Date(s.payoutDate))} by ${s.payoutMethod === 'zelle' ? 'Zelle' : s.payoutMethod}.`
      : 'No payout this month: the operating costs were more than the earnings.';
  text(paidLine, M, y, 9, font, MUTED);
  y -= 26;

  // Trip ledger, one table per car.
  ensure(40);
  text('Trip ledger by vehicle', M, y, 11, bold, NAVY);
  y -= 8;
  const cols = { n: M + 8, start: M + 34, end: M + 94, where: M + 154, grossR: W - M - 8 };
  for (const v of vehicles) {
    const total = v.trips.reduce((a, t) => a + t.gross, 0);
    ensure(60);
    page.drawRectangle({ x: M, y: y - 34, width: W - 2 * M, height: 34, color: NAVY });
    text(fit(bold, `Vehicle  •  ${v.label}${v.plate ? `  •  Plate: ${v.plate}` : ''}`, 10, W - 2 * M - 120), M + 8, y - 14, 10, bold, rgb(1, 1, 1));
    right(`Total: ${usd(total)}`, W - M - 8, y - 14, 10, bold, rgb(1, 1, 1));
    const head: [string, number][] = [['#', cols.n], ['Start', cols.start], ['End', cols.end], ['Location / Notes', cols.where]];
    head.forEach(([h, x]) => text(h, x, y - 29, 8, bold, rgb(1, 1, 1)));
    right('Gross', cols.grossR, y - 29, 8, bold, rgb(1, 1, 1));
    y -= 34;
    if (!v.trips.length) {
      text('No completed trips this month.', cols.n, y - 14, 9, font, MUTED);
      y -= 22;
      continue;
    }
    v.trips.forEach((t, i) => {
      ensure(20);
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 18, color: ZEBRA });
      text(String(i + 1), cols.n, y - 13, 9);
      text(short.format(t.start), cols.start, y - 13, 9);
      text(short.format(t.end), cols.end, y - 13, 9);
      text(fit(font, t.where, 9, cols.grossR - 70 - cols.where), cols.where, y - 13, 9);
      right(usd(t.gross), cols.grossR, y - 13, 9);
      y -= 18;
    });
    page.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 18, color: TILE });
    right('Total', cols.grossR - 80, y - 13, 9, bold);
    right(usd(total), cols.grossR, y - 13, 9, bold);
    y -= 28;
  }

  footer();
  return Buffer.from(await doc.save());
}
