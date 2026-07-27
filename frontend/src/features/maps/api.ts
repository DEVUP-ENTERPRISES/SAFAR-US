import { api } from '@/lib/api/client';

export interface GeoResult { lat: number; lng: number; formatted: string; city: string }
export interface Suggestion { description: string; placeId?: string }

export const mapsApi = {
  autocomplete: (q: string) => api.get<Suggestion[]>('/maps/autocomplete', { q }, false),
  geocode: (q: string) => api.get<GeoResult[]>('/maps/geocode', { q }, false),
};

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
