import type { Response } from 'express';

// A leading = + - @ would run as a formula in Excel; a leading quote keeps it as text.
const cell = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Rows as a CSV file that Excel, Google Sheets and Numbers open with a double click. */
export const toCsv = (rows: unknown[][]): string => `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

export const sendCsv = (res: Response, name: string, csv: string): void => {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' });
  res.send(csv);
};
