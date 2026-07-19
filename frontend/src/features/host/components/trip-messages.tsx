'use client';

import { ChatPanel } from '@/features/messaging/chat-panel';

/**
 * The MESSAGES tab of a host trip. The realtime thread already exists
 * (ChatPanel handles Socket.IO + send), so this only frames it for the trip
 * context rather than duplicating a second chat implementation.
 */
export function TripMessages({ bookingId, guestName }: { bookingId: string; guestName: string }) {
  return (
    <div className="mt-6">
      <p className="mb-3 text-sm text-muted-foreground">
        Coordinate pickup, drop-off and any changes with{' '}
        <span className="font-medium text-foreground">{guestName}</span>.
      </p>
      <ChatPanel bookingId={bookingId} />
    </div>
  );
}
