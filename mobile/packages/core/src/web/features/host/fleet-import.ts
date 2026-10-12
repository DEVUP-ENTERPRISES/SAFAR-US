// Generated from frontend/src/features/host/fleet-import.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import type { ImportRow, RowPreview } from './api';

export interface ParsedRow {
  vin: string;
  registrationNumber?: string;
  title?: string;
  status?: 'listed' | 'unlisted' | 'risk';
}

const STATUS_VALUES = ['listed', 'unlisted', 'risk'] as const;

/** VIN, license plate, optional title, status - one row per car. */
export const IMPORT_SAMPLE = `4T1C11AK5NU123456, TXA1234, , Listed
5YJ3E1EA7KF317834, TXB5678, Tesla Model 3 Long Range, Unlisted`;

/** The fleet's home base - pre-filled since every car in a batch import shares it. */
export const DEFAULT_IMPORT_ADDRESS = '3001 Esters Road, Irving, TX 75062';

/** One car per line; tabs (a spreadsheet paste) or commas; a trailing status word is the status. */
export function parseImport(text: string): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    const parts = line.split(/\t|,/).map((p) => p.trim());
    const [vin, plate, ...rest] = parts;
    if (!vin || vin.length < 11) { errors.push(`Line ${i + 1}: that does not look like a VIN`); return; }
    const last = rest[rest.length - 1]?.toLowerCase();
    const hasStatus = STATUS_VALUES.includes(last as (typeof STATUS_VALUES)[number]);
    const status = hasStatus ? (last as (typeof STATUS_VALUES)[number]) : undefined;
    const title = (hasStatus ? rest.slice(0, -1) : rest).join(', ').trim();
    rows.push({ vin: vin.toUpperCase(), registrationNumber: plate?.trim() || undefined, title: title || undefined, status });
  });
  return { rows, errors };
}

const carriesEdit = (row?: ParsedRow) => !!(row?.registrationNumber || row?.title || row?.status);

/** Ready rows (a duplicate counts when it carries an edit) and the ones needing attention. */
export function importReadiness(preview: RowPreview[], rows: ParsedRow[]) {
  const rowOf = (vin: string) => rows.find((r) => r.vin === vin);
  const ready = preview.filter((p) => (p.duplicate ? carriesEdit(rowOf(p.vin)) : p.ok && p.missing.length === 0)).length;
  const blocked = preview.filter((p) => !p.duplicate && (!p.ok || p.missing.length > 0));
  return { ready, blocked, rowOf };
}

/** The badge for one previewed car. */
export function previewBadge(p: RowPreview, row?: ParsedRow): { label: string; tone: 'default' | 'muted' | 'destructive' | 'warning' | 'success' } {
  if (p.duplicate) return carriesEdit(row) ? { label: 'Already yours - will update', tone: 'default' } : { label: 'Already yours', tone: 'muted' };
  if (!p.ok) return { label: p.error ?? 'Could not decode', tone: 'destructive' };
  if (p.missing.length > 0) return { label: `Needs ${p.missing.join(', ')}`, tone: 'warning' };
  return { label: 'Ready', tone: 'success' };
}

export const toImportRows = (rows: ParsedRow[], address: string): ImportRow[] =>
  rows.map((r) => ({ vin: r.vin, address, registrationNumber: r.registrationNumber, title: r.title, status: r.status }));

export const WHEELBASE_FILL_LABEL: Record<string, string> = { photos: 'photos', description: 'description', features: 'features', insurance: 'insurance link' };
