'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { connectSocket } from '@/lib/realtime/socket';

export interface Message {
  _id: string;
  bookingId: string;
  senderId: string;
  body: string;
  attachments: { url: string; kind: 'image' | 'file'; name?: string }[];
  createdAt: string;
}

export function useMessages(bookingId: string) {
  const query = useQuery({
    queryKey: ['messages', bookingId],
    queryFn: () => api.get<Message[]>(`/messages/${bookingId}`),
    enabled: !!bookingId,
  });
  const [live, setLive] = useState<Message[]>([]);

  // Subscribe to realtime chat messages for this booking room.
  useEffect(() => {
    if (!bookingId) return;
    const socket = connectSocket();
    const onMessage = (msg: Message) => {
      if (msg.bookingId === bookingId) setLive((prev) => [...prev, msg]);
    };
    socket.emit('chat:join', bookingId, () => undefined);
    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
    };
  }, [bookingId]);

  // Merge persisted + live, de-duplicated by id.
  const seen = new Set<string>();
  const all = [...(query.data ?? []), ...live].filter((m) => {
    if (seen.has(m._id)) return false;
    seen.add(m._id);
    return true;
  });

  const send = (body: string) => {
    const socket = connectSocket();
    socket.emit('chat:message', { bookingId, body }, () => undefined);
  };

  return { messages: all, isLoading: query.isLoading, send };
}
