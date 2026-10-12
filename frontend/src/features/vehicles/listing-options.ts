import type { DeliveryLocation, DeliveryLocationKind } from './types';

/**
 * Car colours as one canonical value each, in rough order of how common they
 * are on rental fleets. `ring` marks colours that vanish against a card.
 */
export const CAR_COLORS: { value: string; label: string; hex: string; ring?: boolean }[] = [
  { value: 'white', label: 'White', hex: '#FFFFFF', ring: true },
  { value: 'black', label: 'Black', hex: '#111111' },
  { value: 'gray', label: 'Gray', hex: '#8A8D91' },
  { value: 'silver', label: 'Silver', hex: '#C9CCD1', ring: true },
  { value: 'blue', label: 'Blue', hex: '#1D4ED8' },
  { value: 'red', label: 'Red', hex: '#DC2626' },
  { value: 'green', label: 'Green', hex: '#15803D' },
  { value: 'brown', label: 'Brown', hex: '#78503C' },
  { value: 'beige', label: 'Beige', hex: '#D8C3A5', ring: true },
  { value: 'gold', label: 'Gold', hex: '#B48A3C' },
  { value: 'orange', label: 'Orange', hex: '#EA580C' },
  { value: 'yellow', label: 'Yellow', hex: '#EAB308' },
  { value: 'purple', label: 'Purple', hex: '#7C3AED' },
  { value: 'other', label: 'Other', hex: 'conic-gradient(#DC2626,#EAB308,#15803D,#1D4ED8,#7C3AED,#DC2626)' },
];

/** Swatches whose tick must be dark to read. */
export const LIGHT_COLORS = ['white', 'silver', 'beige', 'yellow'];

/** Vehicle features as a checklist, grouped the way a guest scans a listing. No pets: not permitted on any trip. */
export const FEATURE_GROUPS: { label: string; items: { value: string; label: string }[] }[] = [
  {
    label: 'Safety',
    items: [
      { value: 'backup_camera', label: 'Backup camera' },
      { value: 'blind_spot_warning', label: 'Blind spot warning' },
    ],
  },
  {
    label: 'Convenience',
    items: [
      { value: 'bluetooth', label: 'Bluetooth' },
      { value: 'gps', label: 'GPS' },
      { value: 'keyless_entry', label: 'Keyless entry' },
      { value: 'usb_charger', label: 'USB charger' },
      { value: 'usb_input', label: 'USB input' },
      { value: 'aux_input', label: 'AUX input' },
      { value: 'toll_pass', label: 'Toll pass' },
      { value: 'sunroof', label: 'Sunroof' },
      { value: 'android_auto', label: 'Android Auto' },
      { value: 'apple_carplay', label: 'Apple CarPlay' },
    ],
  },
  { label: 'Family', items: [{ value: 'child_seat', label: 'Child seat' }] },
  {
    label: 'Adventure',
    items: [
      { value: 'bike_rack', label: 'Bike rack' },
      { value: 'ski_rack', label: 'Ski rack' },
      { value: 'snow_tires', label: 'Snow tires' },
    ],
  },
  { label: 'Accessibility', items: [{ value: 'wheelchair_accessible', label: 'Wheelchair accessible' }] },
];

export const KNOWN_FEATURES = new Set(FEATURE_GROUPS.flatMap((g) => g.items.map((i) => i.value)));

export const DELIVERY_KIND: Record<DeliveryLocationKind, { label: string; defaultName: string }> = {
  airport: { label: 'Airport', defaultName: '' },
  hotel: { label: 'Hotel / resort', defaultName: '' },
  business: { label: 'Business address', defaultName: '' },
  custom: { label: 'Anywhere within a radius', defaultName: 'Custom delivery' },
};

export const ACCESS_METHOD_LABEL: Record<DeliveryLocation['accessMethod'], string> = {
  lockbox: 'Lockbox',
  remote_unlock: 'Remote unlock',
  in_person: 'Meet in person',
};

export function blankDeliveryLocation(kind: DeliveryLocationKind): DeliveryLocation {
  return {
    id: `draft-${Date.now()}`,
    kind,
    name: DELIVERY_KIND[kind].defaultName,
    address: '',
    fee: 0,
    minTripDays: kind === 'airport' ? 2 : 0,
    accessMethod: 'in_person',
    ...(kind === 'custom' ? { radiusMiles: 20 } : {}),
    enabled: true,
  };
}

/** The edited fields of one delivery location, back in the stored shape. */
export function deliveryLocationPatch(
  kind: DeliveryLocationKind,
  f: {
    name: string;
    address: string;
    coords?: { lat: number; lng: number };
    fee: string;
    minTripDays: string;
    accessMethod: DeliveryLocation['accessMethod'];
    radiusMiles: string;
    parkingRate: string;
    subLocations: { name: string }[];
  },
): Partial<DeliveryLocation> {
  return {
    name: f.name.trim(),
    address: f.address.trim(),
    ...(f.coords ?? {}),
    fee: Math.round(Number(f.fee || 0) * 100),
    minTripDays: Math.max(0, Number(f.minTripDays) || 0),
    accessMethod: f.accessMethod,
    ...(kind === 'custom' ? { radiusMiles: Math.max(1, Number(f.radiusMiles) || 20) } : {}),
    ...(f.parkingRate ? { parkingRate: f.parkingRate as DeliveryLocation['parkingRate'] } : {}),
    ...(kind === 'airport' ? { subLocations: f.subLocations } : {}),
  };
}
