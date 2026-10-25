'use client';

import { create } from 'zustand';

export interface SearchCenter {
  lat: number;
  lng: number;
  label: string;
}

/**
 * The Where / From / Until of the search bar, shared so the bar can live
 * in the navbar (desktop) while the results page reads the same values to build
 * its query. Filters (price, seats, …) stay local to the results page - only
 * the top-bar fields are shared.
 */
export interface SearchBarState {
  city: string;
  center: SearchCenter | null;
  fromDate: string;
  fromTime: string;
  untilDate: string;
  untilTime: string;
  patch: (p: Partial<Omit<SearchBarState, 'patch'>>) => void;
}

export const useSearchBar = create<SearchBarState>((set) => ({
  city: '',
  center: null,
  fromDate: '',
  fromTime: '10:00',
  untilDate: '',
  untilTime: '10:00',
  patch: (p) => set(p),
}));

/** Combine a date + time into an ISO string, or undefined when no date. */
export function toIso(date: string, time: string): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T${time || '10:00'}`).toISOString();
}

const pad = (n: number) => String(n).padStart(2, '0');
const localStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The first half-hour slot at or after `earliest`, as a local "YYYY-MM-DDTHH:mm". */
export function nextSlot(earliest: Date): string {
  const d = new Date(earliest);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  if (m !== 0 && m !== 30) d.setMinutes(m < 30 ? 30 : 60);
  return localStamp(d);
}

/** A carried-over trip whose pickup has already passed moves to the next valid slot; the trip keeps its length. */
export function keepFuture(start: string, end: string, earliest: Date): { start: string; end: string; moved: boolean } {
  const s = new Date(start);
  if (isNaN(s.getTime()) || s.getTime() >= earliest.getTime()) return { start, end, moved: false };
  const e = new Date(end);
  const length = isNaN(e.getTime()) ? 24 * 3_600_000 : Math.max(3_600_000, e.getTime() - s.getTime());
  const newStart = nextSlot(earliest);
  return { start: newStart, end: localStamp(new Date(new Date(newStart).getTime() + length)), moved: true };
}

/** Times a guest can still pick on `date`: none earlier than `earliest` when the date is today. */
export function pickableTimes(date: string, times: string[], earliest: Date): string[] {
  if (!date) return times;
  return times.filter((t) => new Date(`${date}T${t}`).getTime() >= earliest.getTime());
}
