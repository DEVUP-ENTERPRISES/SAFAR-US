// Generated from frontend/src/lib/utils/safe-message.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
export const GENERIC_ERROR = "We're having trouble connecting right now. Please check your connection and try again in a moment.";

// Anything that reads like our internals (routes, providers, database or code errors) is never shown to a person.
const TECHNICAL = /\/api\/|\bcannot (get|post|put|patch|delete)\b|stripe|twilio|smtp|mongo|e11000|econn|timeout|undefined|\bnull\b|status code|failed with|exception|stack|sql|redis|jwt|token|\(\d{3}\)|firebase|auth\/|network request/i;

/** The text safe to show a person: their own plain message, or a generic one when it looks technical. */
export function safeMessage(message?: string | null, fallback = GENERIC_ERROR): string {
  if (!message || TECHNICAL.test(message)) return fallback;
  return message;
}
