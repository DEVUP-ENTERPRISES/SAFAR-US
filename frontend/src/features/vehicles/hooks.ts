'use client';

import { useQuery } from '@tanstack/react-query';
import { vehicleApi } from './api';
import type { SearchParams } from './types';

export function useVehicleSearch(params: SearchParams | null) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: () => vehicleApi.search(params!),
    enabled: !!params,
    placeholderData: (prev) => prev, // keep old results visible while refetching
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
export function useTrending(lng: number, lat: number) {
  return useQuery({
    queryKey: ['trending', lng, lat],
    queryFn: () => vehicleApi.search({ lng, lat, radiusKm: 60, sort: 'trending', limit: 8 }),
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
