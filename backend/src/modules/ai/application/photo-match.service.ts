import { VehicleModel, type VehicleDoc, type PhotoMatch } from '../../vehicles/infrastructure/vehicle.model';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import { aiGateway, type AiContentPart } from '../infrastructure/ai.gateway';
import { logger } from '../../../infrastructure/logging/logger';

// Vision models read these; HEIC/HEIF photos are left for the admin's eyes.
const READABLE = /\.(jpe?g|png|webp|gif)$/i;
const MAX_PHOTOS = 8;

const SYSTEM = `You check that listing photos show the car the host described.
Look at every photo. Report only what you can actually see; never guess.
Reply with JSON only:
{"plate": string|null, "make": string|null, "model": string|null, "color": string|null, "sameCarInAllPhotos": boolean, "note": string}
- plate: the licence plate text exactly as visible, or null if no plate is readable.
- make/model: the manufacturer and model you recognise, or null if unsure.
- color: the main exterior colour in one or two plain words.
- sameCarInAllPhotos: false if any photo shows a different vehicle.
- note: one short sentence for the reviewer (e.g. which photo differs, or "plate not visible").`;

interface ModelAnswer {
  plate: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  sameCarInAllPhotos: boolean;
  note?: string;
}

// OCR mixes up these look-alikes, so they compare as equal.
const plateKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
const words = (s: string) => s.toLowerCase().replace(/grey/g, 'gray').split(/[^a-z0-9]+/).filter(Boolean);
const loose = (expected: string, seen: string) => {
  const a = expected.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = seen.toLowerCase().replace(/[^a-z0-9]/g, '');
  return a.includes(b) || b.includes(a);
};

type Field = PhotoMatch['fields'][number];

function compare(v: VehicleDoc, seen: ModelAnswer): Field[] {
  const field = (key: Field['key'], expected: string | undefined, got: string | null, same: (e: string, g: string) => boolean): Field | null => {
    if (!expected) return null;
    if (!got) return { key, expected, result: 'not_visible' };
    return { key, expected, seen: got, result: same(expected, got) ? 'match' : 'mismatch' };
  };
  return [
    field('plate', v.registrationNumber, seen.plate, (e, g) => plateKey(e) === plateKey(g)),
    field('make', v.make, seen.make, loose),
    field('model', v.model, seen.model, loose),
    field('color', v.specs?.color, seen.color, (e, g) => words(e).some((w) => words(g).includes(w))),
    { key: 'same_car', result: seen.sameCarInAllPhotos ? 'match' : 'mismatch' } as Field,
  ].filter((f): f is Field => f !== null);
}

async function toDataUri(photo: { url: string; key?: string }): Promise<string | null> {
  try {
    const src = photo.key ? await storageGateway.createDownloadUrl(photo.key) : photo.url;
    const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 6 * 1024 * 1024) return null;
    return `data:${res.headers.get('content-type') ?? 'image/jpeg'};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Checks a car's photos against its plate, make, model and colour; the result is advice for the admin, never a block. */
const pending = new Map<string, NodeJS.Timeout>();

export const photoMatchService = {
  /** Runs the check shortly after the last upload, so a big batch is checked once, off the request path. */
  schedule(vehicleId: string, delayMs = 30_000): void {
    clearTimeout(pending.get(vehicleId));
    const t = setTimeout(() => {
      pending.delete(vehicleId);
      void this.check(vehicleId).catch((err) => logger.warn({ err, vehicleId }, 'photo match check failed'));
    }, delayMs);
    t.unref();
    pending.set(vehicleId, t);
  },

  async check(vehicleId: string): Promise<PhotoMatch | null> {
    const v = await VehicleModel.findById(vehicleId).lean<VehicleDoc>();
    if (!v) return null;

    const save = async (m: PhotoMatch) => {
      await VehicleModel.updateOne({ _id: vehicleId }, { $set: { photoMatch: m } });
      return m;
    };

    if (!aiGateway.isEnabled()) {
      return save({ status: 'unchecked', checkedAt: new Date(), photosChecked: 0, fields: [], note: 'Automatic photo check is off. Compare the photos with the plate, model and colour by eye.' });
    }

    const photos = (v.photos ?? []).filter((p) => READABLE.test((p.key ?? p.url).split('?')[0])).slice(0, MAX_PHOTOS);
    const parts: AiContentPart[] = [];
    for (const p of photos) {
      const uri = await toDataUri(p);
      if (uri) parts.push({ type: 'image_url', image_url: { url: uri } });
    }
    const n = parts.length;
    if (n === 0) {
      return save({ status: 'unchecked', checkedAt: new Date(), photosChecked: 0, fields: [], note: 'No photos in a format the check can read (JPG, PNG or WebP). Compare by eye.' });
    }

    try {
      const { content, model } = await aiGateway.completeJson<ModelAnswer>({
        feature: 'photo-match',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [{ type: 'text', text: `${n} photos of one listing:` }, ...parts] },
        ],
        maxTokens: 400,
        temperature: 0,
      });
      const fields = compare(v, content);
      const status: PhotoMatch['status'] = fields.some((f) => f.result === 'mismatch')
        ? 'mismatch'
        : fields.some((f) => f.result === 'not_visible')
          ? 'partial'
          : 'match';
      return save({ status, checkedAt: new Date(), photosChecked: n, fields, note: content.note?.slice(0, 300), model });
    } catch (err) {
      logger.warn({ err: (err as Error).message, vehicleId }, 'photo match check failed');
      return save({ status: 'unchecked', checkedAt: new Date(), photosChecked: 0, fields: [], note: 'The automatic check could not run just now. Try again, or compare by eye.' });
    }
  },
};
