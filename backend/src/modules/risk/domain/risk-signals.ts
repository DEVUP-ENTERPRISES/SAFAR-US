/**
 * Risk signals and how much each one moves the score.
 *
 * Scores run 0 (clean) to 100 (block). Weights are additive and capped, so no
 * single signal can block an account on its own — that is deliberate: every
 * individual signal here has a legitimate explanation (a traveller on a VPN, a
 * family sharing a tablet), and only a cluster of them means anything.
 */
export type RiskSignal =
  // Device & network
  | 'device_new'
  | 'device_shared_accounts'
  | 'device_emulator'
  | 'device_rooted'
  | 'vpn_or_proxy'
  | 'datacenter_ip'
  | 'gps_mismatch'
  // Identity
  | 'disposable_email'
  | 'email_unverified'
  | 'phone_unverified'
  | 'voip_number'
  | 'duplicate_licence'
  | 'duplicate_phone'
  | 'identity_rejected_before'
  | 'name_mismatch'
  // Velocity
  | 'rapid_signup_burst'
  | 'many_cards_one_account'
  | 'card_seen_on_other_accounts'
  | 'booking_velocity'
  // History
  | 'chargeback_history'
  | 'prior_suspension'
  | 'blacklisted';

export const SIGNAL_WEIGHTS: Record<RiskSignal, number> = {
  // Weak on their own — a new device is the normal state of a new customer.
  device_new: 3,
  vpn_or_proxy: 8,
  datacenter_ip: 12,
  gps_mismatch: 6,
  email_unverified: 5,
  phone_unverified: 8,
  device_shared_accounts: 15,

  // Strong: deliberate evasion or a stolen-identity pattern.
  device_emulator: 25,
  device_rooted: 12,
  disposable_email: 20,
  voip_number: 15,
  duplicate_phone: 20,
  name_mismatch: 15,
  rapid_signup_burst: 22,
  many_cards_one_account: 18,
  card_seen_on_other_accounts: 25,
  booking_velocity: 20,
  identity_rejected_before: 25,

  // Decisive.
  duplicate_licence: 45,
  chargeback_history: 40,
  prior_suspension: 35,
  blacklisted: 100,
};

/** Plain-language reason for the operator queue. Never shown to the user. */
export const SIGNAL_REASONS: Record<RiskSignal, string> = {
  device_new: 'First time we have seen this device',
  device_shared_accounts: 'This device is signed in to several accounts',
  device_emulator: 'Running in an emulator, not a real phone',
  device_rooted: 'Rooted or jailbroken device',
  vpn_or_proxy: 'Connecting through a VPN or proxy',
  datacenter_ip: 'IP belongs to a hosting provider, not a consumer ISP',
  gps_mismatch: 'Reported location disagrees with the IP location',
  disposable_email: 'Throwaway email domain',
  email_unverified: 'Email not confirmed',
  phone_unverified: 'Phone not confirmed',
  voip_number: 'Virtual (VOIP) phone number',
  duplicate_licence: 'This licence is already on another account',
  duplicate_phone: 'This phone number is already on another account',
  identity_rejected_before: 'A previous identity check on this account failed',
  name_mismatch: 'Account name does not match the document',
  rapid_signup_burst: 'Several accounts created from this device recently',
  many_cards_one_account: 'Unusual number of cards added',
  card_seen_on_other_accounts: 'This card is in use on other accounts',
  booking_velocity: 'Booking far faster than a normal customer',
  chargeback_history: 'Previous chargeback',
  prior_suspension: 'Previously suspended',
  blacklisted: 'On the deny list',
};

export type RiskBand = 'low' | 'medium' | 'high' | 'block';

/**
 * Signals that decide the outcome on their own, whatever the arithmetic says.
 *
 * Some findings are not "evidence towards" a conclusion — they ARE the
 * conclusion. The same driving licence on two accounts is not a 45-point
 * nudge; it is either identity theft or account farming, and it needs a human
 * either way. Encoding that as a floor is honest, where inflating the weight
 * until the sum happens to cross a threshold is arithmetic theatre.
 */
export const DECISIVE_SIGNALS: Partial<Record<RiskSignal, RiskBand>> = {
  blacklisted: 'block',
  duplicate_licence: 'high',
  chargeback_history: 'high',
  prior_suspension: 'high',
};

const BAND_ORDER: RiskBand[] = ['low', 'medium', 'high', 'block'];

/** The stricter of the arithmetic band and any decisive signal's floor. */
export function applyFloors(band: RiskBand, signals: RiskSignal[]): RiskBand {
  let worst = band;
  for (const s of signals) {
    const floor = DECISIVE_SIGNALS[s];
    if (floor && BAND_ORDER.indexOf(floor) > BAND_ORDER.indexOf(worst)) worst = floor;
  }
  return worst;
}

/**
 * Bands, not raw scores, drive behaviour — so thresholds can move without
 * every call site changing.
 *
 *   low     normal service
 *   medium  service continues, deposit sized up, Instant Book off
 *   high    manual review before a car is handed over
 *   block   refuse
 */
export function bandFor(
  score: number,
  // Thresholds are admin policy (PlatformConfig.risk.bands) and are injected by
  // the service. Defaults keep this function pure and independently testable.
  bands: { block: number; high: number; medium: number } = { block: 90, high: 60, medium: 30 },
): RiskBand {
  if (score >= bands.block) return 'block';
  if (score >= bands.high) return 'high';
  if (score >= bands.medium) return 'medium';
  return 'low';
}

/** Multiplier applied to the security deposit for this band. */
export const DEPOSIT_MULTIPLIER: Record<RiskBand, number> = {
  low: 1,
  medium: 1.5,
  high: 2,
  block: 2,
};

/** Known throwaway providers. Deliberately a denylist of the biggest ones —
 *  an allowlist would reject legitimate custom domains. */
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'grr.la', 'maildrop.cc', 'dispostable.com',
  'fakeinbox.com', 'getnada.com', 'mailnesia.com', 'mintemail.com',
  'spamgourmet.com', 'mytemp.email', 'tempinbox.com', 'emailondeck.com',
  'moakt.com', 'tempr.email', 'discard.email', 'mailcatch.com',
]);

/** Reserved/unroutable and known datacenter ranges, checked cheaply. */
export function looksLikeDatacenterIp(ip: string): boolean {
  // Cloud provider ranges change constantly; a real deployment subscribes to an
  // IP intelligence feed. This catches the obvious cases without a network call.
  return /^(?:34|35|52|54|3|13|20|40|104\.16|172\.6[4-9]|172\.7[0-9])\./.test(ip);
}
