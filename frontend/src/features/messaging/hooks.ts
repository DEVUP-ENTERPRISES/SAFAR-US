'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { connectSocket } from '@/lib/realtime/socket';

export interface Attachment {
  url: string;
  kind: 'image' | 'file';
  name?: string;
}

export interface Message {
  _id: string;
  bookingId: string;
  senderId: string;
  body: string;
  attachments: Attachment[];
  readBy?: string[];
  createdAt: string;
}

/** The reserved sender id the backend uses for automated notes. */
export const SYSTEM_SENDER = 'system';

/** One inbox row — a booking's conversation, summarised. */
export interface Conversation {
  bookingId: string;
  code: string;
  tripStatus: string;
  vehicle: { title: string; photo?: string };
  counterpart: { name: string; avatar?: string };
  last: { preview: string; at: string; fromMe: boolean; system: boolean };
  unread: number;
}

/** The user's inbox — every conversation across their trips, newest first. */
export function useConversations(enabled = true) {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/messages'),
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Total unread messages across all the user's trips — for the nav badge. */
export function useUnreadMessages(enabled: boolean) {
  return useQuery({
    queryKey: ['messages-unread'],
    queryFn: () => api.get<{ count: number }>('/messages/unread-count'),
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMessages(bookingId: string, myUserId?: string) {
  const query = useQuery({
    queryKey: ['messages', bookingId],
    queryFn: () => api.get<Message[]>(`/messages/${bookingId}`),
    enabled: !!bookingId,
  });
  const [live, setLive] = useState<Message[]>([]);
  // When the counterpart last read the conversation — drives the "Seen" mark.
  const [counterpartReadAt, setCounterpartReadAt] = useState<string | null>(null);

  // Subscribe to realtime chat + read receipts for this booking room.
  useEffect(() => {
    if (!bookingId) return;
    const socket = connectSocket();
    const onMessage = (msg: Message) => {
      if (msg.bookingId === bookingId) setLive((prev) => [...prev, msg]);
    };
    const onRead = (r: { bookingId: string; userId: string; at: string }) => {
      if (r.bookingId === bookingId && r.userId !== myUserId) setCounterpartReadAt(r.at);
    };
    socket.emit('chat:join', bookingId, () => undefined);
    socket.on('chat:message', onMessage);
    socket.on('chat:read', onRead);
    // Mark everything read on open, and tell the room.
    socket.emit('chat:read', bookingId, () => undefined);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:read', onRead);
    };
  }, [bookingId, myUserId]);

  // Merge persisted + live, de-duplicated by id, in time order.
  const seen = new Set<string>();
  const all = [...(query.data ?? []), ...live]
    .filter((m) => {
      if (seen.has(m._id)) return false;
      seen.add(m._id);
      return true;
    })
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  // Has the counterpart seen my latest message? True if they read after it, or
  // if the persisted message already lists them in readBy.
  const myMessages = all.filter((m) => m.senderId === myUserId);
  const lastMine = myMessages[myMessages.length - 1];
  const seenByCounterpart =
    !!lastMine &&
    ((counterpartReadAt != null && +new Date(counterpartReadAt) >= +new Date(lastMine.createdAt)) ||
      (lastMine.readBy ?? []).some((u) => u !== myUserId));

  const send = (body: string, attachments: Attachment[] = []) => {
    const socket = connectSocket();
    socket.emit('chat:message', { bookingId, body, attachments }, () => undefined);
  };

  return { messages: all, isLoading: query.isLoading, send, seenByCounterpart, lastMineId: lastMine?._id };
}
