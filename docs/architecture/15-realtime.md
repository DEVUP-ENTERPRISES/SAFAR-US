# 15 — Realtime (Socket.IO)

Realtime powers live trip status, driver/vehicle location, guest↔host chat, and
instant in-app notifications. It runs **alongside** the HTTP API in the same process
initially, but is designed to be extracted into a dedicated realtime service.

## 15.1 Design principles

- **Auth on the handshake, not per-message.** Verify the JWT once at connect, bind the
  principal to the socket; reject invalid connections before any room join.
- **Rooms, not broadcasts.** Every emit targets a specific room (`user:<id>`,
  `trip:<id>`, `booking:<id>`) — never a global broadcast. This bounds fan-out and is
  the basis for authorization.
- **Redis adapter from day one.** With multiple API instances, a socket connected to
  instance A must receive events emitted from instance B or a worker. The Socket.IO
  **Redis adapter** (pub/sub) makes rooms cluster-wide. Without it, realtime breaks the
  moment you scale past one instance.
- **Services/workers never import Socket.IO.** They call the `realtimeEmitter`
  contract (`toUser`, `toTrip`, `toBooking`), which publishes through the Redis
  adapter. This decouples business logic from transport and is what lets realtime
  become its own service later.
- **Sticky sessions at the LB.** Socket.IO's long-poll upgrade needs affinity; NGINX/
  Cloudflare configured with sticky sessions (ip_hash / cookie) for the WS path.

## 15.2 Namespaces & rooms

```
/trip           — live trip status + location
    rooms: trip:<tripId>   (guest, host, and authorized support join)
/chat           — guest↔host messaging per booking
    rooms: booking:<bookingId>
/notifications  — real-time in-app notifications & badges
    rooms: user:<userId>   (all of a user's devices join → multi-device sync)
```
Room membership is **authorized on join**: a socket may join `trip:<id>` only if its
principal is that trip's guest/host (or a support agent with permission). Fail closed.

## 15.3 Key flows

### Live driver/vehicle location
```
Guest app (during active trip) → emits location to /trip (throttled, e.g. every 5–10s)
   → server validates it's the trip's guest → updates trips.liveLocation (throttled write)
   → broadcasts to trip:<id> room → host sees vehicle move on map
```
- Location writes to Mongo are **throttled/debounced** (last-known + periodic
  persistence); the high-frequency stream goes through Redis pub/sub, not a DB write
  per ping (that would hammer the DB).
- Historical breadcrumb (if needed) is a separate async append, not on the hot path.

### Live trip / booking status
```
Booking/Trip service transitions state → emits domain event → realtimeEmitter.toBooking/toTrip
   → both parties' apps update status live (no polling)
```

### Chat
```
Client sends message on /chat → server persists (support_tickets/chat store) →
   broadcasts to booking:<id> room → delivery/read receipts via acks →
   if recipient offline → falls back to push notification (via notification engine)
```

### Presence & multi-device
- Presence tracked in Redis (`presence:user:<id>` with device set + TTL heartbeat).
- All of a user's devices join `user:<id>`, so a notification/read-state syncs across
  phone + tablet instantly.

## 15.4 Reliability & backpressure

- **Offline fallback:** anything realtime-delivered that the user misses (offline) is
  also persisted (notification feed, chat store) and/or push-notified — realtime is an
  enhancement, never the only delivery path. Correctness never depends on a socket
  being connected.
- **Reconnection:** clients auto-reconnect with backoff and re-sync missed state via a
  REST "catch-up" call (e.g. `GET /trips/{id}`), because you cannot rely on replaying
  ephemeral socket events.
- **Rate limiting** on socket events (location pings, messages) to prevent abuse.
- **Heartbeats/timeouts** clean up dead connections and presence.

## 15.5 Scaling & extraction path

- **Now:** Socket.IO in the API process, Redis adapter, sticky LB. Handles a large
  concurrent connection count per node; scale by adding nodes (Redis adapter keeps
  rooms coherent).
- **Later (dedicated Realtime Service):** because services/workers already emit via
  the `realtimeEmitter` abstraction over Redis pub/sub, we move the Socket.IO layer to
  its own horizontally-scaled fleet subscribing to the same Redis/event stream. The
  business services don't change — they still "publish to a room." Connection load
  (which scales with users online) then scales independently of API request load
  (which scales with actions). This separation is exactly why we abstracted the
  emitter from the start.
