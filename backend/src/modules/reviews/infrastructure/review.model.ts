import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface ReviewDoc {
  _id: string;
  bookingId: string;
  direction: 'guest_to_host' | 'host_to_guest';
  authorId: string;
  subjectId: string;
  vehicleId?: string;
  hostId?: string;
  rating: number;
  comment: string;
  /**
   * `pending` — written, but not shown to anyone yet. Reviews stay here until
   * both sides have had their say or the window closes, so neither party can
   * read the other's before writing their own.
   */
  status: 'pending' | 'published' | 'hidden';
  /** When this became (or becomes) visible. */
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<ReviewDoc>(
  {
    _id: { type: String, default: () => uuid() },
    bookingId: { type: String, required: true },
    direction: { type: String, required: true, enum: ['guest_to_host', 'host_to_guest'] },
    authorId: { type: String, required: true },
    subjectId: { type: String, required: true },
    vehicleId: String,
    hostId: String,
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    status: { type: String, default: 'pending', enum: ['pending', 'published', 'hidden'] },
    publishedAt: Date,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ bookingId: 1, direction: 1 }, { unique: true });
schema.index({ subjectId: 1, status: 1 });
schema.index({ vehicleId: 1, status: 1 });

export const ReviewModel = model<ReviewDoc>('Review', schema);
