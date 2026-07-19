/**
 * Trip carbon footprint + EV savings. Emission factors are kg CO₂ per km
 * (well-to-wheel approximations). Savings compares the trip's vehicle against
 * an average petrol car — the sustainability differentiator.
 */
const FACTORS: Record<string, number> = {
  petrol: 0.192,
  diesel: 0.171,
  hybrid: 0.11,
  ev: 0.05,
};
const BASELINE = 0.192; // average petrol car

export interface CarbonFootprint {
  distanceKm: number;
  fuelType: string;
  emittedKg: number;
  baselineKg: number;
  savedKg: number;
  treesEquivalent: number; // trees needed ~1yr to absorb the saved CO₂
}

export function tripCarbon(distanceKm: number, fuelType: string): CarbonFootprint {
  const factor = FACTORS[fuelType] ?? BASELINE;
  const emitted = distanceKm * factor;
  const baseline = distanceKm * BASELINE;
  const saved = Math.max(0, baseline - emitted);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    distanceKm,
    fuelType,
    emittedKg: round(emitted),
    baselineKg: round(baseline),
    savedKg: round(saved),
    treesEquivalent: round(saved / 21), // ~21 kg CO₂ / tree / year
  };
}
