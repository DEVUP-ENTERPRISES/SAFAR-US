import { api } from '@/lib/api/client';

/** Must match the backend storage.gateway UploadCategory list exactly. */
export type UploadCategory =
  | 'vehicle_photo'
  | 'trip_photo'
  | 'avatar'
  | 'registration'
  | 'insurance'
  | 'kyc'
  | 'claim';

export interface UploadTarget {
  key: string;
  uploadUrl: string;
  publicUrl: string;
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * The real upload flow, in one place: presign → PUT the bytes to storage →
 * hand back the URLs.
 *
 * This existed inline in three separate components (the listing wizard, the
 * listing editor, the avatar picker), each re-implementing the same
 * presign/PUT/verify dance, and a fourth caller faked it entirely with stock
 * photos. Centralised so every uploader is honest and identical: a rejected
 * PUT throws rather than being recorded as a successful upload, because fetch
 * resolves for 4xx/5xx and a silent failure here is how a broken image ends up
 * attached to a booking.
 */
export async function uploadFiles(
  category: UploadCategory,
  files: File[],
): Promise<{ url: string; key: string }[]> {
  if (files.length === 0) return [];

  for (const f of files) {
    if (!ALLOWED.includes(f.type)) {
      throw new Error(`${f.name}: use a JPG, PNG or WebP image.`);
    }
    if (f.size > MAX_BYTES) {
      throw new Error(`${f.name}: keep each image under 12 MB.`);
    }
  }

  const targets = await api.post<UploadTarget[]>('/media/upload-urls', {
    category,
    count: files.length,
    contentType: files[0].type,
  });

  await Promise.all(
    files.map(async (file, i) => {
      const res = await fetch(targets[i].uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!res.ok) {
        throw new Error(`Storage rejected ${file.name} (${res.status}).`);
      }
    }),
  );

  return targets.map((t) => ({ url: t.publicUrl, key: t.key }));
}
