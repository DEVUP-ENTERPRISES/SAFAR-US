export interface IAvailabilityContract {
  isAvailable(vehicleId: string, start: Date, end: Date): Promise<boolean>;
  placeHold(vehicleId: string, start: Date, end: Date): Promise<string>; // returns holdId
  confirmHold(holdId: string, bookingId: string): Promise<void>;
  releaseHold(holdId: string): Promise<void>;
  releaseBooking(bookingId: string): Promise<void>;
}
