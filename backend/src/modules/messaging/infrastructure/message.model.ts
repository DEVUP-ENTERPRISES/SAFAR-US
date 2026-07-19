import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** A message within a booking's conversation. Attachments are S3/CDN URLs. */
export interface MessageDoc {
  _id: string;
  bookingId: string;
  senderId: string;
  body: string;
  attachments: { url: string; kind: 'image' | 'file'; name?: string }[];
  readBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<MessageDoc>(
  {
    _id: { type: String, default: () => uuid() },
    bookingId: { type: String, required: true },
    senderId: { type: String, required: true },
    body: { type: String, default: '' },
    attachments: {
      type: [{ url: String, kind: { type: String, enum: ['image', 'file'] }, name: String }],
      default: [],
    },
    readBy: { type: [String], default: [] },
  },
  { timestamps: true, _id: false },
);

schema.index({ bookingId: 1, createdAt: 1 });

export const MessageModel = model<MessageDoc>('Message', schema);
