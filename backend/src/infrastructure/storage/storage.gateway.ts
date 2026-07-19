/**
 * Storage abstraction. Production binds an S3 implementation that returns
 * presigned PUT URLs; local dev binds the mock. Callers depend on this
 * interface only, so swapping to real S3 changes nothing downstream.
 */
export interface UploadTarget {
  key: string;
  uploadUrl: string; // presigned PUT (client uploads bytes directly here)
  publicUrl: string; // URL to read the object after upload
}

/** What kind of object is being stored — drives the key prefix. */
export type UploadCategory =
  | 'vehicle_photo'
  | 'trip_photo' // pre/post condition photos on a trip
  | 'avatar'
  | 'registration'
  | 'insurance'
  | 'kyc'
  | 'claim';

export const UPLOAD_CATEGORIES = [
  'vehicle_photo',
  'trip_photo',
  'avatar',
  'registration',
  'insurance',
  'kyc',
  'claim',
] as const;

/**
 * Only these may be uploaded. A presigned PUT is a write capability handed to a
 * browser — without an allowlist a caller could park HTML or executables in the
 * bucket and have them served from our own domain.
 */
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf', // documents: registration, insurance, KYC
] as const;

export interface CreateUploadInput {
  ownerId: string;
  category: UploadCategory;
  contentType: string;
  count: number;
}

/**
 * Categories whose objects must NEVER be publicly reachable — identity and
 * legal documents. Their reads go through an authorized, short-lived presigned
 * GET, not the public CDN. Car photos and avatars are shown on public listings
 * anyway, so they stay on the fast public path.
 */
export const PRIVATE_CATEGORIES: UploadCategory[] = [
  'registration',
  'insurance',
  'kyc',
  'claim',
];

export function isPrivateCategory(category: string): boolean {
  return (PRIVATE_CATEGORIES as string[]).includes(category);
}

/** The permission that lets a non-owner (staff) view each private category. */
export const PRIVATE_CATEGORY_PERMISSION: Record<string, string> = {
  kyc: 'kyc:review',
  claim: 'claim:manage',
  registration: 'vehicle:verify',
  insurance: 'vehicle:verify',
};

/**
 * A stored object key looks like `category/YYYY/MM/ownerId/uuid.ext`. Pull the
 * category and owner back out so a download can be authorized against them.
 */
export function parseKey(key: string): { category: string; ownerId: string } | null {
  const parts = key.split('/');
  if (parts.length < 5) return null;
  return { category: parts[0], ownerId: parts[3] };
}

export interface StorageGateway {
  createUploadTargets(input: CreateUploadInput): Promise<UploadTarget[]>;
  /** Short-lived read URL for a private object (presigned GET on S3). */
  createDownloadUrl(key: string): Promise<string>;
}
