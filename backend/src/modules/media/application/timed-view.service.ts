import { createHash, randomBytes } from 'crypto';
import { TimedViewModel, type TimedViewDoc } from '../infrastructure/timed-view.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { timezoneForState } from '../../../shared/utils/us-timezone';
import { ForbiddenError } from '../../../core/errors/app-error';
import { stampDocument } from '../domain/document-watermark';

/** Who is asking, as the route knows them. */
export interface Viewer {
  userId: string;
  roles: string[];
  ip?: string;
  userAgent?: string;
}

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const CLOSED = 'This view has closed. Open it again.';

/** The stamp every viewed page carries: what it is, who is looking (first name, last initial) and the local time. */
export async function viewerStamp(viewerId: string, headline: string, use: string, state?: string): Promise<string[]> {
  const user = await UserModel.findById(viewerId).select('firstName lastName').lean<{ firstName?: string; lastName?: string }>();
  const timeZone = timezoneForState(state) ?? 'America/Chicago';
  const when = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date());
  const name = [user?.firstName, user?.lastName ? `${user.lastName[0]}.` : ''].filter(Boolean).join(' ') || 'CatoDrive user';
  return [headline, `Viewed by ${name}`, when, use];
}

/** Stamp a file for the wire; null when it is not a picture or PDF we can read. */
export async function stampForView(bytes: Buffer, lines: string[]) {
  const stamped = await stampDocument(bytes, lines);
  return stamped && { contentType: stamped.contentType, data: stamped.body.toString('base64') };
}

/** Short-lived, single-viewer access to private files: the viewer holds a random token, the server keeps only its hash. */
export const timedViewService = {
  async open(input: { purpose: string; resourceId: string; viewerId: string; items: string[]; seconds: number; context?: Record<string, string> }) {
    const token = randomBytes(32).toString('base64url');
    const openedAt = new Date();
    const expiresAt = new Date(openedAt.getTime() + input.seconds * 1000);
    await TimedViewModel.create({
      _id: hash(token),
      purpose: input.purpose,
      resourceId: input.resourceId,
      viewerId: input.viewerId,
      items: input.items,
      context: input.context,
      openedAt,
      expiresAt,
      purgeAt: new Date(expiresAt.getTime() + 24 * 3_600_000),
    });
    return { token, expiresAt };
  },

  /** The open viewing this token grants for this item, or a refusal once it is wrong, someone else's, or out of time. */
  async check(input: { token: string; purpose: string; resourceId: string; viewerId: string; item: string }): Promise<TimedViewDoc> {
    const view = await TimedViewModel.findById(hash(input.token)).lean<TimedViewDoc>();
    if (
      !view ||
      view.purpose !== input.purpose ||
      view.resourceId !== input.resourceId ||
      view.viewerId !== input.viewerId ||
      !view.items.includes(input.item) ||
      view.expiresAt.getTime() <= Date.now()
    ) {
      throw new ForbiddenError(CLOSED);
    }
    return view;
  },
};
