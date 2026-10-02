import { Schema, model } from 'mongoose';

/** One short, private viewing (car papers, a guest's ID). The id is the hash of the token the viewer holds, never the token itself. */
export interface TimedViewDoc {
  _id: string;
  purpose: string;
  /** What is being viewed, e.g. the booking. */
  resourceId: string;
  viewerId: string;
  /** The files this viewing may load. */
  items: string[];
  context?: Record<string, string>;
  openedAt: Date;
  expiresAt: Date;
  /** Removed by Mongo a day after it closes; the audit log keeps the history. */
  purgeAt: Date;
}

const schema = new Schema<TimedViewDoc>(
  {
    _id: { type: String, required: true },
    purpose: { type: String, required: true },
    resourceId: { type: String, required: true },
    viewerId: { type: String, required: true },
    items: { type: [String], default: [] },
    context: { type: Schema.Types.Mixed },
    openedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
  },
  { _id: false, versionKey: false },
);

schema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const TimedViewModel = model<TimedViewDoc>('TimedView', schema, 'timed_views');
