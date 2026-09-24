import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A pre-booking question thread between a prospective guest and a host,
 * about one specific vehicle — deliberately separate from `MessageModel`
 * (booking chat). Retrofitting an optional bookingId onto the existing,
 * heavily-used booking-chat model (and its realtime socket rooms) would
 * touch code that already works; a guest asking "does this come with a
 * car seat?" before reserving has no booking to key on anyway.
 *
 * Thread identity is (vehicleId, guestId) — one thread per guest per car.
 */
export interface InquiryMessageDoc {
  _id: string;
  vehicleId: string;
  hostId: string;
  guestId: string;
  senderId: string;
  body: string;
  attachments: { url: string; kind: 'image' | 'file'; name?: string }[];
  readBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<InquiryMessageDoc>(
  {
    _id: { type: String, default: () => uuid() },
    vehicleId: { type: String, required: true },
    hostId: { type: String, required: true },
    guestId: { type: String, required: true },
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

schema.index({ vehicleId: 1, guestId: 1, createdAt: 1 });
schema.index({ hostId: 1, createdAt: -1 });
schema.index({ guestId: 1, createdAt: -1 });

export const InquiryMessageModel = model<InquiryMessageDoc>('InquiryMessage', schema);
