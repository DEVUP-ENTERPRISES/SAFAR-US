import { InquiryMessageModel, type InquiryMessageDoc } from '../infrastructure/inquiry-message.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { hostService } from '../../hosts/application/host.service';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

export interface InquiryAttachment {
  url: string;
  kind: 'image' | 'file';
  name?: string;
}

/** One row in a guest's or host's inquiry inbox. */
export interface InquiryThread {
  vehicleId: string;
  guestId: string;
  vehicle: { title: string; photo?: string };
  counterpart: { name: string; avatar?: string };
  last: { preview: string; at: Date; fromMe: boolean };
  unread: number;
}

/**
 * Pre-booking messaging: a prospective guest asking a host about a specific
 * car, before any booking exists. See InquiryMessageModel for why this is a
 * separate system from booking chat rather than an optional bookingId there.
 */
export class InquiryService {
  /** Guest asks a question, or continues their own thread on this car. */
  async send(
    senderId: string,
    vehicleId: string,
    body: string,
    attachments: InquiryAttachment[] = [],
  ): Promise<InquiryMessageDoc> {
    if (!body.trim() && attachments.length === 0) throw new ValidationError('Message cannot be empty');
    const vehicle = await VehicleModel.findById(vehicleId).lean();
    if (!vehicle) throw new NotFoundError('Vehicle');
    const host = await hostService.getById(vehicle.hostId);

    // A host does not "ask about" their own car — this endpoint is
    // guest-initiated only. Hosts reply via sendReply, scoped to a guest.
    if (host.userId === senderId) {
      throw new ForbiddenError('Use the reply endpoint to answer a guest inquiry');
    }

    return this.write(vehicleId, vehicle.hostId, senderId, senderId, attachments, body);
  }

  /** Host replies within a specific guest's thread on one of their cars. */
  async sendReply(
    senderId: string,
    vehicleId: string,
    guestId: string,
    body: string,
    attachments: InquiryAttachment[] = [],
  ): Promise<InquiryMessageDoc> {
    if (!body.trim() && attachments.length === 0) throw new ValidationError('Message cannot be empty');
    const vehicle = await VehicleModel.findById(vehicleId).lean();
    if (!vehicle) throw new NotFoundError('Vehicle');
    const host = await hostService.getById(vehicle.hostId);
    if (host.userId !== senderId) throw new ForbiddenError('Not the host of this vehicle');

    return this.write(vehicleId, vehicle.hostId, guestId, senderId, attachments, body);
  }

  private async write(
    vehicleId: string,
    hostId: string,
    guestId: string,
    senderId: string,
    attachments: InquiryAttachment[],
    body: string,
  ): Promise<InquiryMessageDoc> {
    const message = await InquiryMessageModel.create({
      vehicleId,
      hostId,
      guestId,
      senderId,
      body: body.trim(),
      attachments,
      readBy: [senderId],
    });

    const host = await hostService.getById(hostId).catch(() => null);
    const recipientUserId = senderId === guestId ? host?.userId : guestId;
    if (recipientUserId) {
      emit(EVENTS.INQUIRY_MESSAGE_SENT, message._id, {
        vehicleId,
        guestId,
        recipientUserId,
        senderId,
        preview: body.slice(0, 80),
      });
    }

    return message.toObject();
  }

  async list(userId: string, vehicleId: string, guestId: string): Promise<InquiryMessageDoc[]> {
    await this.authorize(userId, vehicleId, guestId);
    return InquiryMessageModel.find({ vehicleId, guestId }).sort({ createdAt: 1 }).limit(200).lean<InquiryMessageDoc[]>();
  }

  async markRead(userId: string, vehicleId: string, guestId: string): Promise<void> {
    await this.authorize(userId, vehicleId, guestId);
    await InquiryMessageModel.updateMany(
      { vehicleId, guestId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } },
    );
  }

  /** A guest's own inquiry threads, across every car they've asked about. */
  async myThreads(guestId: string): Promise<InquiryThread[]> {
    return this.threadsFor({ guestId, viewerUserId: guestId });
  }

  /** A host's inbox of every guest inquiry across their fleet. */
  async hostInbox(hostUserId: string): Promise<InquiryThread[]> {
    const host = await hostService.getByUserId(hostUserId).catch(() => null);
    if (!host) return [];
    return this.threadsFor({ hostId: host._id, viewerUserId: hostUserId });
  }

  async unreadCountForGuest(guestId: string): Promise<number> {
    return InquiryMessageModel.countDocuments({ guestId, senderId: { $ne: guestId }, readBy: { $ne: guestId } });
  }

  async unreadCountForHost(hostUserId: string): Promise<number> {
    const host = await hostService.getByUserId(hostUserId).catch(() => null);
    if (!host) return 0;
    // senderId is the guest on any message the host hasn't sent themselves.
    return InquiryMessageModel.countDocuments({
      hostId: host._id,
      senderId: { $ne: hostUserId },
      readBy: { $ne: hostUserId },
    });
  }

  private async threadsFor(match: { guestId?: string; hostId?: string; viewerUserId: string }): Promise<InquiryThread[]> {
    const filter = match.guestId ? { guestId: match.guestId } : { hostId: match.hostId };
    const [lastAgg, unreadAgg] = await Promise.all([
      InquiryMessageModel.aggregate<{
        _id: { vehicleId: string; guestId: string };
        body: string; senderId: string; at: Date; attachments: unknown[];
      }>([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: { vehicleId: '$vehicleId', guestId: '$guestId' },
            body: { $first: '$body' },
            senderId: { $first: '$senderId' },
            at: { $first: '$createdAt' },
            attachments: { $first: '$attachments' },
          },
        },
      ]),
      InquiryMessageModel.aggregate<{ _id: { vehicleId: string; guestId: string }; count: number }>([
        { $match: { ...filter, senderId: { $ne: match.viewerUserId }, readBy: { $ne: match.viewerUserId } } },
        { $group: { _id: { vehicleId: '$vehicleId', guestId: '$guestId' }, count: { $sum: 1 } } },
      ]),
    ]);
    if (lastAgg.length === 0) return [];

    const vehicleIds = [...new Set(lastAgg.map((l) => l._id.vehicleId))];
    const guestIds = [...new Set(lastAgg.map((l) => l._id.guestId))];
    const [vehicles, guests, hosts] = await Promise.all([
      VehicleModel.find({ _id: { $in: vehicleIds } }).select('_id make model year photos hostId').lean(),
      UserModel.find({ _id: { $in: guestIds } }).select('_id firstName avatarUrl').lean(),
      match.hostId ? Promise.resolve([]) : HostModel.find({}).select('_id displayName avatarUrl userId').lean(),
    ]);
    const vehicleById = new Map(vehicles.map((v) => [v._id, v]));
    const guestById = new Map(guests.map((g) => [g._id, g]));
    const hostByVehicleHostId = new Map(hosts.map((h) => [h._id, h]));
    const unreadByKey = new Map(unreadAgg.map((u) => [`${u._id.vehicleId}:${u._id.guestId}`, u.count]));

    const amGuest = !!match.guestId;
    return lastAgg
      .map((l): InquiryThread => {
        const v = vehicleById.get(l._id.vehicleId);
        const g = guestById.get(l._id.guestId);
        const h = amGuest ? hostByVehicleHostId.get(v?.hostId ?? '') : undefined;
        const key = `${l._id.vehicleId}:${l._id.guestId}`;
        return {
          vehicleId: l._id.vehicleId,
          guestId: l._id.guestId,
          vehicle: { title: v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle', photo: v?.photos?.[0]?.url },
          counterpart: amGuest
            ? { name: h?.displayName ?? 'Host', avatar: h?.avatarUrl }
            : { name: g?.firstName ?? 'Guest', avatar: g?.avatarUrl },
          last: {
            preview: l.body?.trim() ? l.body.slice(0, 120) : (l.attachments?.length ? '📷 Photo' : ''),
            at: l.at,
            fromMe: l.senderId === match.viewerUserId,
          },
          unread: unreadByKey.get(key) ?? 0,
        };
      })
      .sort((a, b) => +new Date(b.last.at) - +new Date(a.last.at));
  }

  private async authorize(userId: string, vehicleId: string, guestId: string): Promise<void> {
    if (userId === guestId) return;
    const vehicle = await VehicleModel.findById(vehicleId).select('hostId').lean();
    if (!vehicle) throw new NotFoundError('Vehicle');
    const host = await hostService.getById(vehicle.hostId).catch(() => null);
    if (!host || host.userId !== userId) throw new ForbiddenError('Not part of this conversation');
  }
}

export const inquiryService = new InquiryService();
