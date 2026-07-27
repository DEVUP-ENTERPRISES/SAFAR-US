import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { MessageModel, type MessageDoc } from '../infrastructure/message.model';
import { bookingService } from '../../bookings/application/booking.service';
import { hostService } from '../../hosts/application/host.service';
import { ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

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
      senderId: { $ne: userId },
      readBy: { $ne: userId },
    });
    return { count };
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

export const messageService = new MessageService();
