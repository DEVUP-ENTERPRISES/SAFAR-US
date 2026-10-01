/** One toll read from an NTTA account statement export. */
export interface NttaToll {
  externalId: string;
  postedAt: Date;
  occurredAt: Date;
  location: string;
  tagId?: string;
  plate?: string;
  plateState?: string;
  amountCents: number;
}

export interface NttaParseResult {
  tolls: NttaToll[];
  /** Rows that were not tolls (payments, credits, fees). */
  skipped: number;
  /** Rows that could not be read, with the reason. */
  errors: { line: number; reason: string }[];
}

const TZ = 'America/Chicago';

/** NTTA writes local Texas time with no zone; turn "MM/DD/YYYY HH:mm:ss" into the real instant. */
export function centralTime(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, mo, d, y, h, mi, s] = m.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  // Offset of Texas from UTC at that moment, found by asking how the guess reads in Texas.
  const offsetAt = (t: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(t))
      .reduce<Record<string, number>>((a, x) => (x.type === 'literal' ? a : { ...a, [x.type]: Number(x.value) }), {});
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}

/** "-$1.55" or "($1.55)" → 155 cents. */
export function cents(value: string): number | null {
  const n = Number(value.replace(/[$,()\s]/g, '').replace(/^-/, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** "TX - WDT9577" → { state: 'TX', plate: 'WDT9577' }. */
export function splitPlate(value: string): { plate?: string; plateState?: string } {
  const raw = value.trim();
  if (!raw) return {};
  const m = raw.match(/^([A-Z]{2})\s*-\s*(.+)$/i);
  const plate = normalizePlate(m ? m[2] : raw);
  return { plate: plate || undefined, plateState: m ? m[1].toUpperCase() : undefined };
}

/** Plates compared without spaces, dashes or case. */
export const normalizePlate = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');

function splitRow(line: string, sep: string): string[] {
  if (sep === '\t') return line.split('\t');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"' && quoted) { cur += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Read an NTTA statement (tab- or comma-separated, header row first) into tolls. */
export function parseNttaStatement(text: string): NttaParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const headerAt = lines.findIndex((l) => /transaction id/i.test(l));
  if (headerAt < 0) return { tolls: [], skipped: 0, errors: [{ line: 1, reason: 'No header row with “Transaction ID” found. Paste the statement with its header.' }] };
  const sep = lines[headerAt].includes('\t') ? '\t' : ',';
  const head = splitRow(lines[headerAt], sep).map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.findIndex((h) => h === name);
  const at = {
    posted: col('posted date/time'),
    entry: col('transaction entry date/time'),
    id: col('transaction id'),
    location: col('location'),
    tag: col('tolltag id'),
    plate: col('plate'),
    type: col('transaction type'),
    amount: col('transaction amount'),
  };
  if (at.id < 0 || at.entry < 0 || at.amount < 0) {
    return { tolls: [], skipped: 0, errors: [{ line: headerAt + 1, reason: 'The statement is missing the Transaction ID, entry time or amount column.' }] };
  }

  const out: NttaParseResult = { tolls: [], skipped: 0, errors: [] };
  for (let i = headerAt + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i], sep).map((c) => c.trim());
    const get = (k: keyof typeof at) => (at[k] >= 0 ? cells[at[k]] ?? '' : '');
    if (at.type >= 0 && get('type').toUpperCase() !== 'TOLL') { out.skipped++; continue; }
    const occurredAt = centralTime(get('entry'));
    const postedAt = centralTime(get('posted')) ?? occurredAt;
    const amountCents = cents(get('amount'));
    const externalId = get('id');
    if (!externalId || !occurredAt || !amountCents) {
      out.errors.push({ line: i + 1, reason: 'Missing transaction ID, time or amount' });
      continue;
    }
    out.tolls.push({
      externalId,
      postedAt: postedAt!,
      occurredAt,
      location: get('location').replace(/\s{2,}/g, ' '),
      tagId: get('tag') || undefined,
      ...splitPlate(get('plate')),
      amountCents,
    });
  }
  return out;
}
