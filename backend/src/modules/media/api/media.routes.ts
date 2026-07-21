import { Router } from 'express';
import { z } from 'zod';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import { config } from '../../../config';
import {
  UPLOAD_CATEGORIES,
  ALLOWED_CONTENT_TYPES,
  isPrivateCategory,
  parseKey,
  PRIVATE_CATEGORY_PERMISSION,
} from '../../../infrastructure/storage/storage.gateway';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

// Categories and content types come from the storage contract — so adding a new
// upload surface can't silently 400 because two lists drifted apart.
const uploadUrlSchema = z.object({
  category: z.enum(UPLOAD_CATEGORIES),
  contentType: z.enum(ALLOWED_CONTENT_TYPES).default('image/jpeg'),
  count: z.number().int().min(1).max(20).default(1),
});

/**
 * Returns presigned upload targets. The client PUTs bytes directly to
 * `uploadUrl` (keeping large files off the API), then persists `publicUrl`.
 */
router.post(
  '/upload-urls',
  authenticate,
  validate({ body: uploadUrlSchema }),
  asyncHandler(async (req, res) => {
    const targets = await storageGateway.createUploadTargets({
      ownerId: req.principal!.userId,
      category: req.body.category,
      contentType: req.body.contentType,
      count: req.body.count,
    });
    sendSuccess(res, targets);
  }),
);

/**
 * Authorized read for a PRIVATE object (KYC, licence, insurance, claim). Returns
 * a short-lived presigned GET — never a durable public URL — and only to the
 * document's owner or to staff with the category's review permission. This is
 * what keeps a driver's licence from being reachable by anyone with the link
 * once the bucket sits behind a public CDN.
 */
router.get(
  '/download',
  authenticate,
  validate({ query: z.object({ key: z.string().min(3).max(512) }) }),
  asyncHandler(async (req, res) => {
    const key = String(req.query.key);
    const parsed = parseKey(key);
    if (!parsed) throw new ValidationError('Malformed object key');

    // Public categories don't need this endpoint — but if asked, only gate that
    // it's a real key; the CDN already serves them.
    if (isPrivateCategory(parsed.category)) {
      const isOwner = parsed.ownerId === req.principal!.userId;
      const needed = PRIVATE_CATEGORY_PERMISSION[parsed.category];
      const isStaff =
        req.principal!.permissions.includes('*') ||
        (!!needed && req.principal!.permissions.includes(needed));
      if (!isOwner && !isStaff) {
        throw new ForbiddenError('You are not allowed to view this document');
      }
    }

    const url = await storageGateway.createDownloadUrl(key);
    sendSuccess(res, { url, expiresInSeconds: 120 });
  }),
);

/**
 * Public read for PUBLIC media (listing photos, avatars, trip photos).
 *
 * Deliberately unauthenticated — these are marketplace content, shown to logged
 * out shoppers. It exists so the bucket can keep Block Public Access ON and
 * still serve images: we sign the read here and redirect. Private categories are
 * refused outright; they must go through /media/download, which checks identity.
 *
 * Once a CDN is configured, upload targets point straight at it and this route
 * stops being hit for new media.
 */
router.get(
  '/view',
  validate({ query: z.object({ key: z.string().min(3).max(512) }) }),
  asyncHandler(async (req, res) => {
    const key = String(req.query.key);
    const parsed = parseKey(key);
    if (!parsed) throw new ValidationError('Malformed object key');
    if (isPrivateCategory(parsed.category)) {
      throw new ForbiddenError('This document is not public');
    }

    const url = await storageGateway.createDownloadUrl(key);
    // Cache below the signature's own lifetime so a cached redirect can never
    // outlive the URL it points at.
    res.set('Cache-Control', 'public, max-age=60');
    res.redirect(302, url);
  }),
);

/**
 * Dev-only sink for the mock storage gateway's presigned PUT. It accepts the
 * bytes and throws them away — its whole job is to let the client run the exact
 * same upload path locally as it will against S3. Never mounted when real AWS
 * credentials are configured.
 */
if (!config.aws.enabled) {
  router.put('/mock-upload/*', (_req, res) => {
    res.status(200).end();
  });
}

export const mediaRoutes = router;
