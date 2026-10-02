import { Schema, model } from 'mongoose';

/** One short viewing of a car's papers by its guest. The id is the hash of the token the guest holds, never the token itself. */
export interface TripDocumentViewDoc {
  _id: string;
  bookingId: string;
  tripId: string;
  vehicleId: string;
  viewerId: string;
  documentIds: string[];
  openedAt: Date;
  expiresAt: Date;
  /** Removed by Mongo a day after it closes; the audit log keeps the history. */
  purgeAt: Date;
}

const schema = new Schema<TripDocumentViewDoc>(
  {
    _id: { type: String, required: true },
    bookingId: { type: String, required: true },
    tripId: { type: String, required: true },
    vehicleId: { type: String, required: true },
    viewerId: { type: String, required: true },
    documentIds: { type: [String], default: [] },
    openedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
  },
  { _id: false, versionKey: false },
);

schema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ bookingId: 1, openedAt: -1 });

export const TripDocumentViewModel = model<TripDocumentViewDoc>('TripDocumentView', schema, 'trip_document_views');
