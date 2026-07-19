/** Centralized, typed runtime config. Never read process.env elsewhere. */
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'CATO',
} as const;
