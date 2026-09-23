/** A US odometer reads miles; mileage limits/fees are stored in km. */
export const milesToKm = (mi: number): number => mi / 0.621371;
