'use client';

import { useQuery } from '@tanstack/react-query';
import { vehicleApi } from './api';
import type { SearchParams } from './types';

/**
 * Live marketplace facets. Long staleTime: supply shifts slowly, and this is
 * fetched by the homepage, the search widget and the filters alike.
 */
export function useFacets(city?: string) {
  return useQuery({
    queryKey: ['facets', city ?? null],
    queryFn: () => vehicleApi.facets(city),
    staleTime: 5 * 60_000,
  });
}

export function useVehicleSearch(params: SearchParams | null) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: () => vehicleApi.search(params!),
    enabled: !!params,
    placeholderData: (prev) => prev, // keep old results visible while refetching
  });
}

/**
 * Live counts for every filter option, given the guest's current selection.
 * Shares the search's params so the two always describe the same query.
 */
export function useFilterCounts(params: SearchParams | null) {
  return useQuery({
    queryKey: ['filter-counts', params],
    queryFn: () => vehicleApi.filterCounts(params!),
    enabled: !!params,
    placeholderData: (prev) => prev, // counts shouldn't flicker to zero mid-typing
    staleTime: 30_000,
  });
}

export function useVehicle(id: string) {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => vehicleApi.getById(id),
    enabled: !!id,
  });
}

export function useMyVehicles(enabled: boolean) {
  return useQuery({
    queryKey: ['my-vehicles'],
    queryFn: () => vehicleApi.myVehicles(),
    enabled,
  });
}

/** Trending near a location (sorted by trips/rating server-side). */
export function useTrending(lng?: number, lat?: number) {
  return useQuery({
    queryKey: ['trending', lng ?? null, lat ?? null],
    queryFn: () => vehicleApi.search({ lng: lng!, lat: lat!, radiusKm: 60, sort: 'trending', limit: 8 }),
    // The origin comes from live facets, so it is undefined on first paint —
    // firing then would search 0,0 (the Atlantic) and render an empty state.
    enabled: lng !== undefined && lat !== undefined,
  });
}

/** "For You" — personalized picks from the signed-in user's booking history. */
export function useRecommendations(enabled: boolean) {
  return useQuery({
    queryKey: ['recommendations'],
    queryFn: () => vehicleApi.recommendations(8),
    enabled,
  });
}
