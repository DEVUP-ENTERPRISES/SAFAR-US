import type Redis from 'ioredis';

/**
 * Minimal key-value store abstraction used by sessions, rate limiting and
 * caching. Depending on an interface (not on Redis directly) means:
 *  - production uses the Redis implementation,
 *  - local dev without Redis falls back to an in-memory implementation,
 *  - a module extracted to a service can swap the backing with zero call-site change.
 */
export interface KeyValueStore {
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  exists(key: string): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Atomic set-if-absent with TTL — the basis for a short-lived lock. */
  acquire(key: string, ttlSeconds: number): Promise<boolean>;
  /** Atomic increment; the TTL is set when the counter is created, so the window is fixed. Returns the new count. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

/** Redis-backed implementation (production). */
export class RedisKvStore implements KeyValueStore {
  constructor(private readonly client: Redis) {}

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }
  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
  async acquire(key: string, ttlSeconds: number): Promise<boolean> {
    // SET key 1 EX ttl NX — atomic; returns 'OK' only if the key was absent.
    const res = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }
  async incr(key: string, ttlSeconds: number): Promise<number> {
    // One Lua script so the counter and its expiry can never be split by a crash.
    const n = await this.client.eval(
      "local v=redis.call('INCR',KEYS[1]) if v==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end return v",
      1,
      key,
      String(ttlSeconds),
    );
    return Number(n);
  }
}

/** In-memory fallback (single-process dev only; not for multi-instance prod). */
export class InMemoryKvStore implements KeyValueStore {
  private readonly map = new Map<string, { value: string; expiresAt: number | null }>();

  private isExpired(entry: { expiresAt: number | null }): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.map.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }
  async get(key: string): Promise<string | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }
  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
  async acquire(key: string, ttlSeconds: number): Promise<boolean> {
    // No await between the check and the write, so the lock is atomic on the single Node thread.
    const entry = this.map.get(key);
    if (entry && !this.isExpired(entry)) return false;
    this.map.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }
  async incr(key: string, ttlSeconds: number): Promise<number> {
    // No await between read and write, so this is atomic on the single Node thread.
    const entry = this.map.get(key);
    if (!entry || this.isExpired(entry)) {
      this.map.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
      return 1;
    }
    const next = Number(entry.value) + 1;
    entry.value = String(next);
    return next;
  }
}

/**
 * Selected once at boot. Defaults to in-memory so imports work before
 * bootstrap wires the real store.
 */
let activeStore: KeyValueStore = new InMemoryKvStore();

export function setKvStore(store: KeyValueStore): void {
  activeStore = store;
}

export function kv(): KeyValueStore {
  return activeStore;
}
