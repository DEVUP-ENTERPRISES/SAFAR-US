import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { api } from './web/lib/api/client';

/** Must match the backend storage.gateway UploadCategory list (same list as the website's upload helper). */
export type UploadCategory = 'vehicle_photo' | 'trip_photo' | 'message' | 'avatar' | 'registration' | 'insurance' | 'kyc' | 'claim' | 'recall_receipt';

interface UploadTarget {
  key: string;
  uploadUrl: string;
  publicUrl: string;
}

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
  /** Where and when it was taken, when the phone recorded it. */
  exif?: Record<string, unknown> | null;
}

/** Long edge in pixels after resizing; keeps uploads fast without losing detail damage claims need. */
const MAX_EDGE = 2048;

async function shrink(photo: PickedPhoto): Promise<{ uri: string; size: number }> {
  const scale = Math.min(1, MAX_EDGE / Math.max(photo.width, photo.height));
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (scale < 1) ctx.resize({ width: Math.round(photo.width * scale), height: Math.round(photo.height * scale) });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  const blob = await (await fetch(saved.uri)).blob();
  return { uri: saved.uri, size: blob.size };
}

/**
 * The website's presign → PUT → keep-the-key flow, for phone photos: resize,
 * ask the API for upload targets, PUT the bytes straight to storage. A rejected
 * PUT throws, so a broken image is never recorded as uploaded.
 */
export async function uploadPhotos(category: UploadCategory, photos: PickedPhoto[]): Promise<{ url: string; key: string; sha256?: string }[]> {
  if (photos.length === 0) return [];
  const ready = await Promise.all(photos.map(shrink));
  if (ready.some((r) => r.size <= 0)) throw new Error('One of the photos is empty. Please take it again.');

  const targets = await api.post<UploadTarget[]>('/media/upload-urls', { category, sizes: ready.map((r) => r.size), contentType: 'image/jpeg' });

  const hashes = await Promise.all(
    ready.map(async (r, i) => {
      const body = await (await fetch(r.uri)).blob();
      const res = await fetch(targets[i].uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': 'image/jpeg' } });
      if (!res.ok) throw new Error("A photo didn't upload. Check your connection and try again.");
      return sha256Of(r.uri);
    }),
  );
  return targets.map((t, i) => ({ url: t.publicUrl, key: t.key, sha256: hashes[i] }));
}

/** SHA-256 of the uploaded bytes, for tamper evidence on condition photos; omitted if the phone can't compute it. */
async function sha256Of(uri: string): Promise<string | undefined> {
  try {
    const buf = await (await fetch(uri)).arrayBuffer();
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(buf));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

export type PickSource = 'camera' | 'library';

/** Opens the camera or library after the permission prompt. Returns null if cancelled or refused. */
export async function pickPhotos(source: PickSource, opts: { multiple?: boolean; selfie?: boolean } = {}): Promise<PickedPhoto[] | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    exif: true,
    allowsMultipleSelection: source === 'library' && !!opts.multiple,
    cameraType: opts.selfie ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  return result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height, exif: a.exif }));
}
