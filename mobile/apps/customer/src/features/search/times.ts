/** Every half hour of the day as "HH:mm", the website's pick-up and return times. */
export const HALF_HOURS: string[] = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
