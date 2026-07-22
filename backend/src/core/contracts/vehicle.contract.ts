/** Snapshot the booking engine needs from supply — never the raw model. */
export interface VehicleForBooking {
  id: string;
  hostId: string;
  instantBook: boolean;
  cancellationPolicy: 'flexible' | 'moderate' | 'strict';
  minTripHours: number;
  maxTripHours: number;
  currency: string;
  /** Minor units — the security deposit is sized off this. */
  dailyPrice: number;
  bookable: boolean;
}

export interface IVehicleContract {
  getForBooking(vehicleId: string): Promise<VehicleForBooking>;
  isBookable(vehicleId: string): Promise<boolean>;
}
