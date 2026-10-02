import { KycModel, type KycDoc } from '../infrastructure/kyc.model';
import { identityProvider, type IdPhoto } from '../infrastructure/identity.provider';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import { logger } from '../../../infrastructure/logging/logger';

export const ID_PHOTO_LABEL: Record<IdPhoto, string> = {
  selfie: 'Selfie',
  licence_front: 'Driving licence (front)',
  licence_back: 'Driving licence (back)',
};

/** The storage key behind an uploaded file's URL (CDN path or /media/view?key=). */
function keyOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.searchParams.get('key') ?? decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch {
    return undefined;
  }
}

/** Manual-review uploads: the selfie, then the ID pages in the order they were sent. */
function uploadFor(kyc: KycDoc, kind: IdPhoto) {
  if (kind === 'selfie') return kyc.documents.find((d) => d.type === 'selfie');
  return kyc.documents.filter((d) => d.type !== 'selfie')[kind === 'licence_front' ? 0 : 1];
}

const ageOn = (dob: Date, at = new Date()) => {
  const d = new Date(dob);
  let age = at.getUTCFullYear() - d.getUTCFullYear();
  if (at.getUTCMonth() < d.getUTCMonth() || (at.getUTCMonth() === d.getUTCMonth() && at.getUTCDate() < d.getUTCDate())) age--;
  return age;
};

/** A guest's verified identity, and their ID photos for those allowed to see them. */
export const guestIdentityService = {
  /** What the ID check established. No photo, link or key is in here. */
  async summary(userId: string) {
    const kyc = await KycModel.findOne({ userId }).lean<KycDoc>();
    if (!kyc) return { status: 'not_started' as const, photos: [] as IdPhoto[], photosReadable: false };
    const name = [kyc.verifiedFirstName, kyc.verifiedLastName].filter(Boolean).join(' ') || undefined;
    const fromStripe = kyc.provider === 'stripe' && !!kyc.providerSessionId;
    const photos: IdPhoto[] = fromStripe
      ? ['selfie', 'licence_front', 'licence_back']
      : (['selfie', 'licence_front', 'licence_back'] as IdPhoto[]).filter((k) => !!uploadFor(kyc, k));
    return {
      status: kyc.status,
      verifiedName: name,
      dob: kyc.verifiedDob,
      age: kyc.verifiedDob ? ageOn(kyc.verifiedDob) : undefined,
      licenceExpiry: kyc.licenceExpiry,
      verifiedAt: kyc.decisionAt,
      source: fromStripe ? ('stripe' as const) : ('upload' as const),
      photos,
      /** Stripe photos need the read key; without it the summary still shows, the photos say "not available yet". */
      photosReadable: fromStripe ? identityProvider.canReadPhotos : photos.length > 0,
    };
  },

  /** The raw photo, read on the server. Null when it was never captured or cannot be read. */
  async photo(userId: string, kind: IdPhoto): Promise<Buffer | null> {
    const kyc = await KycModel.findOne({ userId }).lean<KycDoc>();
    if (!kyc) return null;
    try {
      if (kyc.provider === 'stripe' && kyc.providerSessionId) return await identityProvider.photo(kyc.providerSessionId, kind);
      const upload = uploadFor(kyc, kind);
      const key = upload && keyOf(upload.url);
      return key ? (await storageGateway.readObject(key)).body : null;
    } catch (err) {
      logger.error({ err: (err as Error).message, userId, kind }, 'ID photo could not be read');
      return null;
    }
  },
};
