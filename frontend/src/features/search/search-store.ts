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
 * its query. Filters (price, seats, …) stay local to the results page — only
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
