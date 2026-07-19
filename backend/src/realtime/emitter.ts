import type { Server } from 'socket.io';
import { logger } from '../infrastructure/logging/logger';

/**
 * Transport-agnostic realtime emitter. Services and workers call these
 * methods to push to clients WITHOUT importing socket.io — the day realtime
 * becomes its own service, only this file's transport changes.
 */
class RealtimeEmitter {
  private io: Server | null = null;

  bind(io: Server): void {
    this.io = io;
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.io?.to(`user:${userId}`).emit(event, payload);
  }

  toTrip(tripId: string, event: string, payload: unknown): void {
    this.io?.to(`trip:${tripId}`).emit(event, payload);
  }

  toBooking(bookingId: string, event: string, payload: unknown): void {
    this.io?.to(`booking:${bookingId}`).emit(event, payload);
  }

  isReady(): boolean {
    if (!this.io) logger.debug('realtime emit skipped — socket server not ready');
    return !!this.io;
  }
}

export const realtimeEmitter = new RealtimeEmitter();

/** Canonical client<->server event names (kept in one place). */
export const RT = {
  BOOKING_UPDATE: 'booking:update',
  TRIP_STATUS: 'trip:status',
  TRIP_LOCATION: 'trip:location',
  CHAT_MESSAGE: 'chat:message',
  NOTIFICATION: 'notification',
  TRIP_ALERT: 'trip:alert',
} as const;
