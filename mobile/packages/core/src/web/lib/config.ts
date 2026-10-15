// App-owned replacement for frontend/src/lib/config.ts: same shape, values from EXPO_PUBLIC_* at build time.
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.catodrive.com/api/v1',
  appName: 'CatoDrive',
  assetPartnersOnly: (process.env.EXPO_PUBLIC_LAUNCH_MODE ?? 'asset_partners_only') === 'asset_partners_only',
  corporate: process.env.EXPO_PUBLIC_CORPORATE === 'on',
} as const;
