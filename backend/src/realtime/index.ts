import type { Server as HttpServer } from 'http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { config } from '../config';
import { logger } from '../infrastructure/logging/logger';
import { redis, isRedisHealthy } from '../infrastructure/cache/redis.client';
import { tokenService } from '../modules/auth/application/token.service';
import { realtimeEmitter, RT } from './emitter';
import { trackingPhaseService } from '../modules/trips/application/tracking-phase.service';
import { approachService } from '../modules/trips/application/approach.service';
import { BookingModel } from '../modules/bookings/infrastructure/booking.model';
import { tripService } from '../modules/trips/application/trip.service';
import { messageService } from '../modules/messaging/application/message.service';

interface SocketPrincipal {
  userId: string;
  sessionId: string;
}

/**
 * Attaches Socket.IO to the HTTP server. Auth happens once on the handshake;
 * rooms are authorized on join. With multiple API instances, the Redis
 * adapter makes rooms cluster-wide so an emit from any node reaches the
 * right sockets.
 */
export function initRealtime(httpServer: HttpServer): void {
  const io = new SocketServer(httpServer, {
    cors: { origin: config.cors.origins.includes('*') ? true : config.cors.origins, credentials: true },
    transports: ['websocket', 'polling'],
  });

  if (isRedisHealthy()) {
    const pub = redis.duplicate();
    const sub = redis.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info('Socket.IO Redis adapter enabled (cluster-wide rooms)');
  }

  // ── Handshake auth: verify the access token once, bind the principal. ──
  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('unauthorized'));
      const claims = tokenService.verifyAccess(token);
      (socket.data as { principal: SocketPrincipal }).principal = {
        userId: claims.sub,
        sessionId: claims.sid,
      };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const principal = (socket.data as { principal: SocketPrincipal }).principal;
    // Every device of a user joins their personal room (multi-device fan-out).
    void socket.join(`user:${principal.userId}`);
    logger.debug({ userId: principal.userId }, 'socket connected');

    // Join a trip room — only participants may (verified against the trip).
    socket.on('trip:join', async (tripId: string, ack?: (ok: boolean) => void) => {
      try {
        const trip = await tripService.get(tripId);
        const allowed = trip.guestId === principal.userId || (await tripService.isHostUser(principal.userId, trip.hostId));
        if (!allowed) return ack?.(false);
        await socket.join(`trip:${tripId}`);
        await socket.join(`booking:${trip.bookingId}`);
        ack?.(true);
      } catch {
        ack?.(false);
      }
    });

    /*
     * Join a booking room for the approach.
     *
     * Separate from trip:join because the trip does not exist yet during the
     * approach — that is the whole point of keying this on the booking.
     */
    socket.on('booking:join', async (bookingId: string, ack?: (ok: boolean) => void) => {
      try {
        const b = await BookingModel.findById(bookingId).lean<{ guestId: string; hostId: string }>();
        if (!b) return ack?.(false);
        if (b.guestId !== principal.userId && b.hostId !== principal.userId) return ack?.(false);
        await socket.join(`booking:${bookingId}`);
        ack?.(true);
      } catch {
        ack?.(false);
      }
    });

    // Join a booking conversation room (chat) — participant-only.
    socket.on('chat:join', async (bookingId: string, ack?: (ok: boolean) => void) => {
      try {
        await messageService.assertAccess(principal.userId, bookingId);
        await socket.join(`booking:${bookingId}`);
        ack?.(true);
      } catch {
        ack?.(false);
      }
    });

    /*
     * Location streaming, gated on the trip's tracking phase.
     *
     * The gate is HERE rather than only in the client, because a client that
     * keeps streaming — a stale tab, an old build, a modified one — must not be
     * able to keep a guest's position flowing through the middle of a hire.
     * The server decides when tracking is open, and silently drops the rest.
     */
    /*
     * Location streaming during the approach, keyed on the BOOKING.
     *
     * Deliberately not the trip: the trip record is created at handover, so
     * anything trip-keyed is unreachable in the window before it — which is
     * exactly when people want to see each other coming.
     *
     * The gate is on the server rather than only in the client, because a
     * stale tab or a modified build must not be able to keep a guest's
     * position flowing through the middle of a hire.
     */
    socket.on('trip:location', async (data: { bookingId: string; lng: number; lat: number }) => {
      try {
        const booking = await BookingModel.findById(data.bookingId).lean<{
          _id: string; guestId: string; hostId: string; tripId?: string;
        }>();
        if (!booking) return;
        if (booking.guestId !== principal.userId && booking.hostId !== principal.userId) return;

        const role = booking.hostId === principal.userId ? 'host' : 'guest';
        if (!(await trackingPhaseService.mayBroadcast(data.bookingId, role))) return;

        // trip.liveLocation means "where the car is", so only the guest's
        // position is persisted, and only once a trip exists. Storing the
        // host's would overwrite the car's position — which the handover ETA
        // reads to work out when the host should set off.
        if (role === 'guest' && booking.tripId) {
          await tripService
            .updateLocation(principal.userId, booking.tripId, data.lng, data.lat)
            .catch(() => undefined);
        }

        // Recompute the mover's ETA and tell the counterpart if it slipped.
        // Runs off the stream their device is already sending, because the
        // person who is late is driving and cannot type.
        void approachService
          .onPosition(data.bookingId, role, { lat: data.lat, lng: data.lng })
          .catch(() => undefined);

        // The role rides along: both parties broadcast during the approach, and
        // without it the client renders one marker jumping between two people.
        realtimeEmitter.toBooking(data.bookingId, RT.TRIP_LOCATION, {
          bookingId: data.bookingId,
          role,
          lng: data.lng,
          lat: data.lat,
          at: new Date().toISOString(),
        });
      } catch {
        /* ignore invalid location pings */
      }
    });

    // Chat within a booking conversation — text and/or photo attachments.
    socket.on(
      'chat:message',
      async (
        data: { bookingId: string; body: string; attachments?: { url: string; kind: 'image' | 'file'; name?: string }[] },
        ack?: (ok: boolean) => void,
      ) => {
        try {
          const msg = await messageService.send(principal.userId, data.bookingId, data.body, data.attachments ?? []);
          realtimeEmitter.toBooking(data.bookingId, RT.CHAT_MESSAGE, msg);
          ack?.(true);
        } catch {
          ack?.(false);
        }
      },
    );

    // Read receipts — mark the conversation read and tell the room so the other
    // party's "Seen" updates without a refetch.
    socket.on('chat:read', async (bookingId: string, ack?: (ok: boolean) => void) => {
      try {
        await messageService.markRead(principal.userId, bookingId);
        realtimeEmitter.toBooking(bookingId, RT.CHAT_READ, {
          bookingId,
          userId: principal.userId,
          at: new Date().toISOString(),
        });
        ack?.(true);
      } catch {
        ack?.(false);
      }
    });

    socket.on('disconnect', () => logger.debug({ userId: principal.userId }, 'socket disconnected'));
  });

  realtimeEmitter.bind(io);
  logger.info('✅ Socket.IO realtime gateway ready');
}
