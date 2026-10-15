import { hostApi, type UploadTarget } from './api';

// The server issues at most this many upload links per request.
const PER_REQUEST = 20;

const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', gif: 'image/gif',
};

/** A file's image type, from the browser or else its extension (Drive and Windows often leave HEIC blank). */
export function imageTypeOf(file: File): string {
  if (file.type) return file.type;
  return EXT_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/jpeg';
}

/** Uploads any number of photos of any mix of types straight to storage; returns each file with where it landed. */
export async function uploadVehiclePhotos(files: File[]): Promise<{ file: File; target: UploadTarget }[]> {
  const byType = new Map<string, File[]>();
  for (const f of files) {
    const t = imageTypeOf(f);
    byType.set(t, [...(byType.get(t) ?? []), f]);
  }

  const pairs: { file: File; target: UploadTarget; type: string }[] = [];
  for (const [type, group] of byType) {
    for (let i = 0; i < group.length; i += PER_REQUEST) {
      const batch = group.slice(i, i + PER_REQUEST);
      const targets = await hostApi.uploadUrls('vehicle_photo', batch, type);
      batch.forEach((file, j) => pairs.push({ file, target: targets[j], type }));
    }
  }

  await Promise.all(
    pairs.map(async ({ file, target, type }) => {
      const res = await fetch(target.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': type } });
      if (!res.ok) throw new Error('A photo could not be uploaded. Please try again.');
    }),
  );
  return pairs.map(({ file, target }) => ({ file, target }));
}
