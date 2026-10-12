import { api } from './web/lib/api/client';
import { appInfo } from './app-info';

export interface AppRelease {
  minVersion: string;
  latestVersion: string;
  androidUrl: string;
  iosUrl: string;
}

/** -1, 0 or 1 for two versions like "1.4.0"; missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export type UpdateState = { kind: 'ok' } | { kind: 'optional' | 'required'; storeUrl: string };

/** Whether this build must update, may update, or is current. An unreachable server never blocks the app. */
export async function checkAppRelease(platform: 'ios' | 'android'): Promise<UpdateState> {
  try {
    const r = await api.get<AppRelease>(`/platform/app-release/${appInfo.id}`, undefined, false);
    const storeUrl = platform === 'ios' ? r.iosUrl : r.androidUrl;
    if (compareVersions(appInfo.version, r.minVersion) < 0) return { kind: 'required', storeUrl };
    if (compareVersions(appInfo.version, r.latestVersion) < 0) return { kind: 'optional', storeUrl };
  } catch {
    /* offline or server down: let the person in */
  }
  return { kind: 'ok' };
}
