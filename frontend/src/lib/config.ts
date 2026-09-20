/** Centralized, typed runtime config. Never read process.env elsewhere. */
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'CatoDrive',
  /**
   * This launch goes to market on Asset Partners alone — Host self-serve,
   * Fleet management and Corporate accounts stay off every nav, footer and
   * homepage CTA until this flips back.
   *
   * Deliberately an env var, not a hardcoded boolean: turning these back on
   * later is a deploy, not a code change, and nothing here is deleted — an
   * existing host's own dashboard and an existing corporate admin's console
   * still work by direct link the whole time. Only the invitations to
   * self-onboard are hidden.
   */
  assetPartnersOnly: (process.env.NEXT_PUBLIC_LAUNCH_MODE ?? 'asset_partners_only') === 'asset_partners_only',
} as const;
