import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomId } from '../../shared/utils/uuid';
import { config } from '../../config';
import { logger } from '../logging/logger';
import {
  ALLOWED_CONTENT_TYPES,
  type StorageGateway,
  type CreateUploadInput,
  type UploadTarget,
} from './storage.gateway';

/** contentType → file extension, so objects are served with a sane name/type. */
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const PRESIGN_TTL_SECONDS = 900; // 15 min — long enough for a slow mobile upload

/**
 * Why a configured public base URL can't be trusted, or null if it looks real.
 * Catches the copy-paste-the-docs-example case that yields broken images.
 */
function placeholderReason(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'not a valid URL';
  }
  if (url.protocol !== 'https:') return 'must be https';

  const host = url.hostname.toLowerCase();
  // A run of 3+ x's, or the literal doc placeholders, never appears in a real
  // CloudFront distribution or bucket domain.
  if (/x{3,}/.test(host)) return 'contains xxx';
  if (/^(example|changeme|your-|placeholder)/.test(host)) return 'example hostname';
  if (host === 'cloudfront.net' || host === 'localhost') return 'incomplete hostname';
  return null;
}

/**
 * Production S3 storage. Clients receive a presigned PUT and upload bytes
 * straight to the bucket, so large photos never traverse the API.
 *
 * Hardening applied here:
 *  - content type is allowlisted AND baked into the signature, so a client
 *    cannot swap an image upload for an HTML/executable one after signing;
 *  - keys are date-partitioned and random (no user-controlled path segments —
 *    that's how you get path traversal / object overwrites);
 *  - objects are written with a long immutable Cache-Control, because the key
 *    is unique per upload and the bytes never change.
 */
export class S3StorageGateway implements StorageGateway {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;
  private readonly hasCdn: boolean;

  constructor() {
    // Fail fast and loudly: a half-configured bucket must not silently degrade
    // into broken image URLs in production.
    const missing = (
      [
        ['AWS_REGION', config.aws.region],
        ['AWS_ACCESS_KEY_ID', config.aws.accessKeyId],
        ['AWS_SECRET_ACCESS_KEY', config.aws.secretAccessKey],
        ['S3_BUCKET', config.aws.s3Bucket],
      ] as const
    )
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      throw new Error(`S3 storage selected but missing config: ${missing.join(', ')}`);
    }

    this.s3 = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId!,
        secretAccessKey: config.aws.secretAccessKey!,
      },
    });
    this.bucket = config.aws.s3Bucket!;

    // Prefer a CDN base (CloudFront) when supplied — cheaper and faster than
    // serving reads straight from the bucket. But a *placeholder* base is worse
    // than none: `https://dxxxx.cloudfront.net` is a well-formed URL pointing at
    // a host that does not exist, so every upload succeeds and every photo then
    // renders as a broken image. Only trust a base we can actually resolve.
    const directBase = `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com`;
    const configured = config.aws.s3PublicBaseUrl?.trim();
    const rejection = configured ? placeholderReason(configured) : null;

    if (configured && rejection) {
      // In production this is a deploy blocker: images would be broken for
      // every user. In development, fall back so uploads still work.
      const message = `S3_PUBLIC_BASE_URL looks like a placeholder (${rejection}): ${configured}`;
      if (config.env === 'production') throw new Error(message);
      logger.warn(`${message} — falling back to direct S3 URLs`);
    }

    this.hasCdn = !!configured && !rejection;
    this.publicBase = (this.hasCdn ? configured! : directBase).replace(/\/+$/, '');

    logger.info(
      { bucket: this.bucket, base: this.publicBase, cdn: this.hasCdn },
      '📦 Storage: AWS S3',
    );
    if (!this.hasCdn) {
      logger.warn(
        'No CDN configured — public media is served through the API (/media/view), ' +
          'which signs each read. Set S3_PUBLIC_BASE_URL to a CloudFront domain for production.',
      );
    }
  }

  async createUploadTargets(input: CreateUploadInput): Promise<UploadTarget[]> {
    const contentType = input.contentType.toLowerCase();
    if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw new Error(`Unsupported content type: ${input.contentType}`);
    }

    const now = new Date();
    const datePart = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const ext = EXT[contentType] ?? 'bin';

    return Promise.all(
      Array.from({ length: input.count }, async () => {
        // Random, date-partitioned key. Nothing user-supplied ends up in the path.
        const key = `${input.category}/${datePart}/${input.ownerId}/${randomId()}.${ext}`;

        const uploadUrl = await getSignedUrl(
          this.s3,
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType, // signed in — the client cannot change it
            CacheControl: 'public, max-age=31536000, immutable',
          }),
          { expiresIn: PRESIGN_TTL_SECONDS },
        );

        return { key, uploadUrl, publicUrl: this.publicUrlFor(key) };
      }),
    );
  }

  /**
   * A URL a browser can actually load.
   *
   * With a CDN in front, that's the object's CDN address. Without one, a direct
   * S3 URL only works if the bucket is publicly readable — and it should not be.
   * So we point at our own /media/view, which signs the read on demand. Uploads
   * used to return the direct URL unconditionally, which is why every photo
   * uploaded successfully and then rendered as a broken image (S3 answered 403).
   */
  publicUrlFor(key: string): string {
    if (this.hasCdn) return `${this.publicBase}/${key}`;
    return `${config.app.publicUrl}/media/view?key=${encodeURIComponent(key)}`;
  }

  /**
   * Presigned GET for a private object. Short TTL because the URL grants read
   * access to whoever holds it — it's handed to an already-authorized viewer
   * and expires before it can be shared around.
   */
  async createDownloadUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 120 }, // 2 min
    );
  }
}
