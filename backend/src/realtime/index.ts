import type { Server as HttpServer } from 'http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { config } from '../config';
import { logger } from '../infrastructure/logging/logger';
import { redis, isRedisHealthy } from '../infrastructure/cache/redis.client';
import { tokenService } from '../modules/auth/application/token.service';
import { realtimeEmitter, RT } from './emitter';
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

    // Guest streams live location during an active trip.
    socket.on('trip:location', async (data: { tripId: string; lng: number; lat: number }) => {
      try {
        await tripService.updateLocation(principal.userId, data.tripId, data.lng, data.lat);
        realtimeEmitter.toTrip(data.tripId, RT.TRIP_LOCATION, {
          tripId: data.tripId,
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
