import { aiGateway, type AiContentPart } from '../infrastructure/ai.gateway';
import { DamageAssessmentModel, type DamageFinding } from '../infrastructure/damage-assessment.model';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Damage review: compare a trip's check-in photos with its checkout photos and
 * report what changed.
 *
 * This is the worst experience in peer-to-peer car rental. Both sides already
 * hold the same photographs and still argue for days, because nobody neutral
 * ever looks at them side by side. A model can do exactly that in seconds.
 *
 * Three boundaries make this safe to ship, and they are deliberate:
 *
 *  1. It DRAFTS, it does not charge. The output is a finding attached to the
 *     trip; a human opens the claim and moves the money. A model that can bill
 *     a customer is a liability, not a feature.
 *  2. It reports what CHANGED, never what it costs. Vision models are good at
 *     "this scratch is new" and unreliable at "this is $340 of paintwork".
 *     Repair pricing stays with the adjuster.
 *  3. Low confidence is an outcome, not a failure. Below the threshold the
 *     finding is marked `needs_human` and says so, rather than guessing.
 *
 * Photos are sent as base64, not as URLs. Our media URLs point at our own API
 * (and, on a dev box, at localhost) which no external model can reach — passing
 * the URL would silently produce a review of nothing.
 */

const SYSTEM = `You are a vehicle damage assessor comparing photographs of the same car before and after a rental.

You will receive CHECK-IN photos (before the trip) followed by CHECKOUT photos (after the trip), each labelled with its index.

Report only differences that indicate NEW damage acquired during the rental. Ignore:
- differences in lighting, angle, distance, weather, wetness or shadow
- dirt, dust, water spots, pollen and road grime
- reflections, and objects reflected in paintwork
- anything already visible in a check-in photo

For each finding give: the panel/area, the damage type, a short factual description, which photos evidence it, and your confidence 0-1.

Be conservative. A false accusation costs a real person real money. If you are unsure whether something is new damage or a lighting artefact, either omit it or give it low confidence and say why. Reporting nothing is a valid and common answer.

Never estimate repair cost. Never assign blame.

Respond ONLY with JSON matching:
{"findings":[{"area":string,"type":"scratch"|"dent"|"crack"|"chip"|"stain"|"missing_part"|"tyre"|"other","description":string,"checkinPhotoIndexes":number[],"checkoutPhotoIndexes":number[],"confidence":number,"note":string}],"overallNote":string}`;

interface ModelResponse {
  findings: DamageFinding[];
  overallNote?: string;
}

/** Below this, a finding is advisory only and flagged for a human. */
const CONFIDENCE_THRESHOLD = 0.6;
/** Vision calls are billed per image; a whole gallery is rarely more informative. */
const MAX_PHOTOS_PER_PHASE = 6;

async function toDataUri(photo: { url: string; key?: string }): Promise<string | null> {
  try {
    // Prefer a presigned URL from the key — it works regardless of what host
    // the stored absolute URL happens to name.
    const src = photo.key ? await storageGateway.createDownloadUrl(photo.key) : photo.url;
    const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Guard against a huge original blowing the request budget.
    if (buf.byteLength > 6 * 1024 * 1024) return null;
    const mime = res.headers.get('content-type') ?? 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export const damageReviewService = {
  enabled(): boolean {
    return aiGateway.isEnabled();
  },

  /** The stored review for a trip, if one has been run. */
  async get(tripId: string) {
    return DamageAssessmentModel.findOne({ tripId }).lean();
  },

  /**
   * Run (or re-run) the comparison for a trip.
   * Returns the persisted assessment.
   */
  async review(tripId: string, requestedBy: string) {
    if (!aiGateway.isEnabled()) throw new Error('AI is not configured');

    const trip = await TripModel.findById(tripId).lean();
    if (!trip) throw new Error('Trip not found');

    const pre = (trip.photos ?? []).filter((p) => p.phase === 'pre').slice(0, MAX_PHOTOS_PER_PHASE);
    const post = (trip.photos ?? []).filter((p) => p.phase === 'post').slice(0, MAX_PHOTOS_PER_PHASE);

    // Without both sides there is nothing to compare, and a one-sided "review"
    // would be an opinion about a photograph rather than evidence of a change.
    if (pre.length === 0 || post.length === 0) {
      throw new Error(
        pre.length === 0
          ? 'No check-in photos on this trip — there is nothing to compare against'
          : 'No checkout photos on this trip yet',
      );
    }

    const parts: AiContentPart[] = [];
    const attach = async (list: typeof pre, label: string) => {
      let i = 0;
      for (const p of list) {
        const uri = await toDataUri(p);
        if (!uri) continue;
        parts.push({ type: 'text', text: `${label} photo ${i}` });
        parts.push({ type: 'image_url', image_url: { url: uri } });
        i += 1;
      }
      return i;
    };

    parts.push({ type: 'text', text: 'CHECK-IN photos (before the rental):' });
    const nPre = await attach(pre, 'CHECK-IN');
    parts.push({ type: 'text', text: 'CHECKOUT photos (after the rental):' });
    const nPost = await attach(post, 'CHECKOUT');

    if (nPre === 0 || nPost === 0) {
      throw new Error('Could not load the trip photos for comparison');
    }

    // Odometer and fuel are cheap corroboration the model should see.
    const context: string[] = [];
    if (trip.handover?.odometerStart != null && trip.return?.odometerEnd != null) {
      context.push(`Odometer ${trip.handover.odometerStart} → ${trip.return.odometerEnd}.`);
    }
    if (trip.handover?.fuelStart != null && trip.return?.fuelEnd != null) {
      context.push(`Fuel ${trip.handover.fuelStart}% → ${trip.return.fuelEnd}%.`);
    }
    if (context.length) parts.push({ type: 'text', text: `Trip context: ${context.join(' ')}` });

    const started = Date.now();
    const { content, model, costCents } = await aiGateway.completeJson<ModelResponse>({
      feature: 'damage-review',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: parts },
      ],
      maxTokens: 1500,
      temperature: 0, // Determinism matters when the output can cost someone money.
    });

    const findings = (content.findings ?? []).map((f) => ({
      ...f,
      confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0)),
    }));
    const confident = findings.filter((f) => f.confidence >= CONFIDENCE_THRESHOLD);

    const doc = await DamageAssessmentModel.findOneAndUpdate(
      { tripId },
      {
        tripId,
        bookingId: trip.bookingId,
        vehicleId: trip.vehicleId,
        findings,
        overallNote: content.overallNote,
        photosCompared: { pre: nPre, post: nPost },
        model,
        costCents,
        latencyMs: Date.now() - started,
        // The verdict a human reads first.
        verdict: confident.length === 0 ? 'no_new_damage' : 'damage_found',
        needsHuman: findings.length > 0 && confident.length === 0,
        requestedBy,
        reviewedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    logger.info(
      `Damage review ${tripId}: ${confident.length}/${findings.length} confident findings (${costCents}c)`,
    );
    return doc;
  },
};
