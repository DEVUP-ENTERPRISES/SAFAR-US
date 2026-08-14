/**
 * A one-way signal from the API layer to the app: this session is over.
 *
 * The API client cannot import the auth store (the store imports the client, so
 * that would be a cycle), and it must not navigate on its own — that decision
 * belongs to the app shell, which knows whether the user is in the customer,
 * host, or admin portal. So the client announces, and the shell reacts.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Called by the API client when a 401 survives a refresh attempt. */
export function onSessionExpired(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A misbehaving listener must not stop the others from signing the user out.
    }
  });
}

/** Subscribe to session expiry. Returns an unsubscribe function. */
export function subscribeSessionExpired(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
