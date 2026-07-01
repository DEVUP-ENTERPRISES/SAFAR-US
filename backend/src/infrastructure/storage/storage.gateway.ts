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

export interface CreateUploadInput {
  ownerId: string;
  category: 'vehicle_photo' | 'registration' | 'insurance' | 'kyc' | 'claim';
  contentType: string;
  count: number;
}

export interface StorageGateway {
  createUploadTargets(input: CreateUploadInput): Promise<UploadTarget[]>;
}
