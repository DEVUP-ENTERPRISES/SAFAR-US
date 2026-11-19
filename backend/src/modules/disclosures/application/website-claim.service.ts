import { WebsiteClaimModel, type ClaimFigure, type ClaimStatus, type WebsiteClaimDoc } from '../infrastructure/website-claim.model';
import { CLAIM_SEEDS, NEEDS_LEGAL, REVIEW_DAYS, type ClaimOwner } from '../domain/defaults';
import { UserModel } from '../../users/infrastructure/user.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { uuid } from '../../../shared/utils/uuid';

const DAY = 86_400_000;
const REMIND_EVERY_MS = 7 * DAY;

export interface ClaimPatch {
  label?: string;
  display?: string;
  value?: number | null;
  asOf?: string | null;
  wording?: string;
  definition?: string;
  pages?: string[];
  owner?: ClaimOwner;
  responsibleUserId?: string | null;
  note?: string;
}

const event = (by: string, action: string, note?: string) => ({ at: new Date(), by, action, ...(note ? { note } : {}) });
const nextReview = (c: Pick<WebsiteClaimDoc, 'category'>, from = new Date()) => new Date(from.getTime() + REVIEW_DAYS[c.category] * DAY);

async function byKey(key: string): Promise<WebsiteClaimDoc> {
  const c = await WebsiteClaimModel.findOne({ key }).lean<WebsiteClaimDoc>();
  if (!c) throw new NotFoundError('Claim');
  return c;
}

// Moves a claim only if it is still in one of the expected states, so two staff acting at once cannot both win.
async function transition(key: string, from: ClaimStatus[], update: Record<string, unknown>, refusal: string): Promise<WebsiteClaimDoc> {
  const doc = await WebsiteClaimModel.findOneAndUpdate({ key, status: { $in: from } }, update, { new: true }).lean<WebsiteClaimDoc>();
  if (doc) return doc;
  await byKey(key);
  throw new ConflictError(refusal, 'CLAIM_STATE');
}

async function alertTeam(title: string, body: string): Promise<void> {
  const { contact } = await platformConfigService.get();
  await channelProviders.email
    .send({ target: { userId: 'staff', email: contact.notifyEmail }, templateKey: 'compliance.claims', title, body })
    .catch((err) => logger.warn({ err: (err as Error).message }, 'claims register email failed'));
}

export const websiteClaimService = {
  async seed(): Promise<number> {
    let created = 0;
    for (const s of CLAIM_SEEDS) {
      if (await WebsiteClaimModel.exists({ key: s.key })) continue;
      const fig: ClaimFigure = { label: s.label, display: s.display, value: s.value, asOf: s.asOf, kind: s.kind };
      try {
        await WebsiteClaimModel.create({
          _id: uuid(), key: s.key, category: s.category, owner: s.owner, wording: s.wording, definition: s.definition, pages: s.pages,
          draft: fig, live: fig, status: 'evidence', firstPublishedAt: new Date(), nextReviewAt: new Date(),
          history: [event('system', 'Added to the register as already published; evidence needed')],
        });
        created += 1;
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    if (created) logger.info({ created }, 'website claims register seeded');
    return created;
  },

  async list(): Promise<WebsiteClaimDoc[]> {
    return WebsiteClaimModel.find().sort({ nextReviewAt: 1, key: 1 }).limit(200).lean<WebsiteClaimDoc[]>();
  },

  async get(key: string): Promise<WebsiteClaimDoc & { names: Record<string, string> }> {
    const c = await byKey(key);
    const ids = [...new Set([...c.history.map((h) => h.by), ...c.evidence.map((e) => e.addedBy), c.responsibleUserId].filter((x): x is string => !!x && x !== 'system'))];
    const users = ids.length ? await UserModel.find({ _id: { $in: ids } }).select('firstName lastName email').lean<{ _id: string; firstName?: string; lastName?: string; email: string }[]>() : [];
    const names = Object.fromEntries(users.map((u) => [u._id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email]));
    return { ...c, names };
  },

  async update(userId: string, key: string, p: ClaimPatch): Promise<WebsiteClaimDoc> {
    const c = await byKey(key);
    const draft: ClaimFigure = {
      ...c.draft,
      ...(p.label !== undefined ? { label: p.label } : {}),
      ...(p.display !== undefined ? { display: p.display } : {}),
      ...(p.value !== undefined ? { value: p.value ?? undefined } : {}),
      ...(p.asOf !== undefined ? { asOf: p.asOf ?? undefined } : {}),
    };
    const set: Record<string, unknown> = { draft, status: c.evidence.length ? 'evidence' : 'draft' };
    if (p.wording !== undefined) set.wording = p.wording;
    if (p.definition !== undefined) set.definition = p.definition;
    if (p.pages !== undefined) set.pages = p.pages;
    if (p.owner !== undefined) set.owner = p.owner;
    const unset: Record<string, 1> = { verifiedBy: 1, verifiedAt: 1, legalReviewedBy: 1, legalReviewedAt: 1, legalNote: 1 };
    if (p.responsibleUserId === null) unset.responsibleUserId = 1;
    else if (p.responsibleUserId !== undefined) set.responsibleUserId = p.responsibleUserId;
    const doc = await WebsiteClaimModel.findOneAndUpdate(
      { key, updatedAt: c.updatedAt },
      { $set: set, $unset: unset, $push: { history: event(userId, 'Edited; needs verification and approval again', p.note) } },
      { new: true },
    ).lean<WebsiteClaimDoc>();
    if (!doc) throw new ConflictError('Someone else just changed this claim. Reload and try again.', 'CLAIM_STALE');
    return doc;
  },

  async addEvidence(userId: string, key: string, e: { label: string; url?: string; note?: string }): Promise<WebsiteClaimDoc> {
    const c = await byKey(key);
    const doc = await WebsiteClaimModel.findOneAndUpdate(
      { key },
      {
        $push: { evidence: { _id: uuid(), ...e, addedBy: userId, addedAt: new Date() }, history: event(userId, `Evidence added: ${e.label}`) },
        ...(c.status === 'draft' ? { $set: { status: 'evidence' } } : {}),
      },
      { new: true },
    ).lean<WebsiteClaimDoc>();
    return doc!;
  },

  async removeEvidence(userId: string, key: string, evidenceId: string): Promise<WebsiteClaimDoc> {
    const c = await byKey(key);
    const item = c.evidence.find((e) => e._id === evidenceId);
    if (!item) throw new NotFoundError('Evidence');
    const left = c.evidence.length - 1;
    const backToEvidence = ['verified', 'legal_review'].includes(c.status) && left === 0;
    const doc = await WebsiteClaimModel.findOneAndUpdate(
      { key },
      {
        $pull: { evidence: { _id: evidenceId } },
        $push: { history: event(userId, `Evidence removed: ${item.label}`) },
        ...(backToEvidence ? { $set: { status: 'evidence' }, $unset: { verifiedBy: 1, verifiedAt: 1 } } : {}),
      },
      { new: true },
    ).lean<WebsiteClaimDoc>();
    return doc!;
  },

  async verify(userId: string, key: string, note?: string): Promise<WebsiteClaimDoc> {
    const c = await byKey(key);
    if (!c.evidence.length) throw new ValidationError('Add at least one supporting record before verifying.');
    const next: ClaimStatus = NEEDS_LEGAL.has(c.category) ? 'legal_review' : 'verified';
    return transition(key, ['draft', 'evidence'], {
      $set: { status: next, verifiedBy: userId, verifiedAt: new Date() },
      $push: { history: event(userId, next === 'legal_review' ? 'Verified; waiting for legal review' : 'Verified', note) },
    }, 'Only a claim waiting for verification can be verified.');
  },

  async recordLegalReview(userId: string, key: string, note: string): Promise<WebsiteClaimDoc> {
    return transition(key, ['legal_review'], {
      $set: { status: 'verified', legalReviewedBy: userId, legalReviewedAt: new Date(), legalNote: note },
      $push: { history: event(userId, 'Legal review recorded', note) },
    }, 'This claim isn’t waiting for legal review.');
  },

  async approve(userId: string, key: string, note?: string): Promise<WebsiteClaimDoc> {
    const c = await byKey(key);
    if (NEEDS_LEGAL.has(c.category) && !c.legalReviewedAt) throw new ValidationError('This claim needs a recorded legal review before approval.');
    const now = new Date();
    return transition(key, ['verified'], {
      $set: { status: 'approved', live: c.draft, approvedBy: userId, approvedAt: now, lastReviewedAt: now, nextReviewAt: nextReview(c, now), firstPublishedAt: c.firstPublishedAt ?? now },
      $unset: { remindedAt: 1 },
      $push: { history: event(userId, `Approved and published: ${c.draft.display}`, note) },
    }, 'Only a verified claim can be approved.');
  },

  async suspend(userId: string, key: string, reason: string): Promise<WebsiteClaimDoc> {
    const doc = await transition(key, ['draft', 'evidence', 'verified', 'legal_review', 'approved'], {
      $set: { status: 'suspended', live: null },
      $push: { history: event(userId, 'Suspended and taken off the website', reason) },
    }, 'This claim is already suspended.');
    const manual = doc.draft.kind === 'text';
    await alertTeam(
      `Website claim suspended: ${doc.draft.label}`,
      `"${doc.wording}" was suspended.\n\nReason: ${reason}\n\n${manual ? `This is wording in the page text, so it must also be removed from: ${doc.pages.join(', ')}.` : 'The figure is hidden from the website automatically.'}\n\nPreserve the related records (package Part VII) and log the decision in the claims register.`,
    );
    return doc;
  },

  async markReviewed(userId: string, key: string, note?: string): Promise<WebsiteClaimDoc> {
    const c = await byKey(key);
    const now = new Date();
    return transition(key, ['approved'], {
      $set: { lastReviewedAt: now, nextReviewAt: nextReview(c, now) },
      $unset: { remindedAt: 1 },
      $push: { history: event(userId, 'Reviewed; still accurate', note) },
    }, 'Only an approved claim can be marked reviewed. Edit it instead.');
  },

  // What the website shows: the approved figure, or null when suspended.
  async publicMap(): Promise<Record<string, ClaimFigure | null>> {
    const rows = await WebsiteClaimModel.find({ 'draft.kind': { $ne: 'text' } }).select('key live').lean<Pick<WebsiteClaimDoc, 'key' | 'live'>[]>();
    return Object.fromEntries(rows.map((r) => [r.key, r.live ?? null]));
  },

  async remindOverdue(now = new Date()): Promise<number> {
    const due = await WebsiteClaimModel.find({
      status: { $ne: 'suspended' },
      nextReviewAt: { $lte: now },
      $or: [{ remindedAt: null }, { remindedAt: { $lte: new Date(now.getTime() - REMIND_EVERY_MS) } }],
    }).select('key wording owner nextReviewAt status').limit(100).lean<Pick<WebsiteClaimDoc, '_id' | 'key' | 'wording' | 'owner' | 'nextReviewAt' | 'status'>[]>();
    if (!due.length) return 0;
    const lines = due.map((d) => `- ${d.wording} (${d.owner}, ${d.status.replace('_', ' ')}, due ${d.nextReviewAt?.toISOString().slice(0, 10)})`);
    await alertTeam(`${due.length} website claim${due.length === 1 ? '' : 's'} due for review`, `These published claims need their review (package section 24):\n\n${lines.join('\n')}\n\nOpen Website Claims in the admin console to add evidence, verify, approve or suspend.`);
    await WebsiteClaimModel.updateMany({ _id: { $in: due.map((d) => d._id) } }, { $set: { remindedAt: now } });
    return due.length;
  },
};
