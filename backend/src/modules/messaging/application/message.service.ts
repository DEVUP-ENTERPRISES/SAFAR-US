import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { MessageModel, type MessageDoc } from '../infrastructure/message.model';
import { bookingService } from '../../bookings/application/booking.service';
import { hostService } from '../../hosts/application/host.service';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { realtimeEmitter, RT } from '../../../realtime/emitter';

/** Reserved sender id for automated, system-authored conversation messages. */
export const SYSTEM_SENDER = 'system';

export interface Attachment {
  url: string;
  kind: 'image' | 'file';
  name?: string;
}

/**
 * Host↔guest messaging scoped to a booking. Only the two participants may
 * read/write. Sending emits an event so notifications fire when a recipient
 * is offline (see event subscriptions).
 */
export class MessageService {
  async send(
    senderId: string,
    bookingId: string,
    body: string,
    attachments: Attachment[] = [],
  ): Promise<MessageDoc> {
    if (!body.trim() && attachments.length === 0) {
      throw new ValidationError('Message cannot be empty');
    }
    const { booking, counterpartUserId } = await this.authorize(senderId, bookingId);

    const message = await MessageModel.create({
      bookingId: booking._id,
      senderId,
      body: body.trim(),
      attachments,
      readBy: [senderId],
    });

    emit(EVENTS.CHAT_MESSAGE_SENT, bookingId, {
      bookingId,
      messageId: message._id,
      senderId,
      recipientUserId: counterpartUserId,
      preview: body.slice(0, 80),
    });

    return message.toObject();
  }

  /**
   * Post an automated message into a booking's conversation — "Trip started",
   * "Extended to …", and so on — so the thread reads as the running record of
   * the trip. No sender authorisation (the system is always allowed) and it is
   * broadcast to anyone watching the room so it appears live.
   */
  async system(bookingId: string, body: string): Promise<MessageDoc> {
    const message = await MessageModel.create({
      bookingId,
      senderId: SYSTEM_SENDER,
      body,
      attachments: [],
      readBy: [SYSTEM_SENDER],
    });
    const obj = message.toObject();
    if (realtimeEmitter.isReady()) realtimeEmitter.toBooking(bookingId, RT.CHAT_MESSAGE, obj);
    return obj;
  }

  async list(userId: string, bookingId: string): Promise<MessageDoc[]> {
    await this.authorize(userId, bookingId);
    return MessageModel.find({ bookingId }).sort({ createdAt: 1 }).limit(200).lean<MessageDoc[]>();
  }

  async markRead(userId: string, bookingId: string): Promise<void> {
    await this.authorize(userId, bookingId);
    await MessageModel.updateMany(
      { bookingId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } },
    );
  }

  /**
   * Total unread messages for a user across all their trips — drives the nav
   * badge. Unread = a message the user did not send and has not read, in a
   * booking they are part of.
   */
  async unreadCount(userId: string): Promise<{ count: number }> {
    const host = await hostService.getByUserId(userId).catch(() => null);
    const bookings = await BookingModel.find(
      { $or: [{ guestId: userId }, ...(host ? [{ hostId: host._id }] : [])] },
      { _id: 1 },
    ).lean<{ _id: string }[]>();
    const ids = bookings.map((b) => b._id);
    if (ids.length === 0) return { count: 0 };
    const count = await MessageModel.countDocuments({
      bookingId: { $in: ids },
      // System notes are informational, not a person awaiting a reply — they
      // belong in the thread but must not light up the unread-messages badge.
      senderId: { $nin: [userId, SYSTEM_SENDER] },
      readBy: { $ne: userId },
    });
    return { count };
  }

  /**
   * The user's inbox — one entry per booking they have a conversation on, newest
   * first, with the counterpart, the car, a preview of the last message, and the
   * unread count. Only bookings that actually have a message appear (an empty
   * booking is not a conversation). Enrichment is batched, not per-row.
   */
  async conversations(userId: string): Promise<Conversation[]> {
    const myHost = await hostService.getByUserId(userId).catch(() => null);
    const bookings = await BookingModel.find({
      $or: [{ guestId: userId }, ...(myHost ? [{ hostId: myHost._id }] : [])],
    })
      .select('_id guestId hostId vehicleId code status')
      .lean<{ _id: string; guestId: string; hostId: string; vehicleId: string; code: string; status: string }[]>();
    if (bookings.length === 0) return [];
    const ids = bookings.map((b) => b._id);

    const [lastAgg, unreadAgg] = await Promise.all([
      MessageModel.aggregate<{ _id: string; body: string; senderId: string; at: Date; attachments: unknown[] }>([
        { $match: { bookingId: { $in: ids } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$bookingId', body: { $first: '$body' }, senderId: { $first: '$senderId' }, at: { $first: '$createdAt' }, attachments: { $first: '$attachments' } } },
      ]),
      MessageModel.aggregate<{ _id: string; count: number }>([
        { $match: { bookingId: { $in: ids }, senderId: { $nin: [userId, SYSTEM_SENDER] }, readBy: { $ne: userId } } },
        { $group: { _id: '$bookingId', count: { $sum: 1 } } },
      ]),
    ]);
    const lastByBooking = new Map(lastAgg.map((l) => [l._id, l]));
    const unreadByBooking = new Map(unreadAgg.map((u) => [u._id, u.count]));

    // Only bookings that actually have a message are conversations.
    const active = bookings.filter((b) => lastByBooking.has(b._id));
    if (active.length === 0) return [];

    const hostIds = [...new Set(active.map((b) => b.hostId))];
    const guestIds = [...new Set(active.map((b) => b.guestId))];
    const vehicleIds = [...new Set(active.map((b) => b.vehicleId))];
    const [hosts, guests, vehicles] = await Promise.all([
      HostModel.find({ _id: { $in: hostIds } }).select('_id displayName avatarUrl').lean<{ _id: string; displayName: string; avatarUrl?: string }[]>(),
      UserModel.find({ _id: { $in: guestIds } }).select('_id firstName avatarUrl').lean<{ _id: string; firstName?: string; avatarUrl?: string }[]>(),
      VehicleModel.find({ _id: { $in: vehicleIds } }).select('_id make model year photos').lean<{ _id: string; make: string; model: string; year: number; photos?: { url: string }[] }[]>(),
    ]);
    const hostById = new Map(hosts.map((h) => [h._id, h]));
    const guestById = new Map(guests.map((g) => [g._id, g]));
    const vehicleById = new Map(vehicles.map((v) => [v._id, v]));

    const rows = active.map((b): Conversation => {
      const amGuest = b.guestId === userId;
      const host = hostById.get(b.hostId);
      const guest = guestById.get(b.guestId);
      const v = vehicleById.get(b.vehicleId);
      const last = lastByBooking.get(b._id)!;
      const hasAttachment = Array.isArray(last.attachments) && last.attachments.length > 0;
      return {
        bookingId: b._id,
        code: b.code,
        tripStatus: b.status,
        vehicle: { title: v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle', photo: v?.photos?.[0]?.url },
        counterpart: amGuest
          ? { name: host?.displayName ?? 'Host', avatar: host?.avatarUrl }
          : { name: guest?.firstName ?? 'Guest', avatar: guest?.avatarUrl },
        last: {
          preview: last.body?.trim() ? last.body.slice(0, 120) : hasAttachment ? '📷 Photo' : '',
          at: last.at,
          fromMe: last.senderId === userId,
          system: last.senderId === SYSTEM_SENDER,
        },
        unread: unreadByBooking.get(b._id) ?? 0,
      };
    });
    rows.sort((a, b) => +new Date(b.last.at) - +new Date(a.last.at));
    return rows;
  }

  /** Read-only thread for admin/support investigating a dispute (no participant gate). */
  async adminThread(bookingId: string): Promise<MessageDoc[]> {
    return MessageModel.find({ bookingId }).sort({ createdAt: 1 }).limit(500).lean<MessageDoc[]>();
  }

  /** Public participant check for the realtime gateway (throws if not allowed). */
  async assertAccess(userId: string, bookingId: string): Promise<void> {
    await this.authorize(userId, bookingId);
  }

  /** Verify the user is a participant and return the counterpart's userId. */
  private async authorize(userId: string, bookingId: string) {
    const booking = await bookingService.getDoc(bookingId);
    const isGuest = booking.guestId === userId;
    const host = await hostService.getById(booking.hostId).catch(() => null);
    const isHost = !!host && host.userId === userId;
    if (!isGuest && !isHost) throw new ForbiddenError('Not part of this conversation');
    const counterpartUserId = isGuest ? host?.userId ?? '' : booking.guestId;
    return { booking, counterpartUserId };
  }
}

/** One inbox row — a booking's conversation summarised for the message list. */
export interface Conversation {
  bookingId: string;
  code: string;
  tripStatus: string;
  vehicle: { title: string; photo?: string };
  counterpart: { name: string; avatar?: string };
  last: { preview: string; at: Date; fromMe: boolean; system: boolean };
  unread: number;
}

export const messageService = new MessageService();
