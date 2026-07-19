'use client';

import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/config';
import { tokenStore } from '@/lib/api/token-store';

/**
 * Singleton Socket.IO client. Connects with the access token on the
 * handshake. The socket base is the API origin (without the /api/v1 path).
 */
let socket: Socket | null = null;

function socketBase(): string {
  try {
    const u = new URL(config.apiUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'http://localhost:8080';
  }
}

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(socketBase(), {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: tokenStore.getAccess() ?? '' }),
  });
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
