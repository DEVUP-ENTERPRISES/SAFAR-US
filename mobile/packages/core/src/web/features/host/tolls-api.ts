// Generated from frontend/src/features/host/tolls-api.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import { api } from '../../lib/api/client';

/** A toll agency account linked by the host, as the host sees it: never the login itself. */
export interface HostTollAccount {
  _id: string;
  agency: 'ntta';
  nickname: string;
  status: 'manual' | 'connected' | 'disconnected';
  hasLogin: boolean;
  loginSavedAt?: string;
  lastImportAt?: string;
  lastFetchAt?: string;
  vehicleIds: string[];
}

/** Agencies shown in the picker; only the supported ones can be linked today. */
export const TOLL_AGENCIES: { id: string; label: string; supported: boolean }[] = [
  { id: 'ntta', label: 'NTTA (Texas)', supported: true },
  { id: 'hctra', label: 'HCTRA (Texas)', supported: false },
  { id: 'txtag', label: 'TxTag (Texas)', supported: false },
  { id: 'sunpass', label: 'SunPass (Florida)', supported: false },
  { id: 'ipass', label: 'I-Pass & Pay by plate (Illinois)', supported: false },
  { id: 'ezpass_ma', label: 'E-Z Pass Massachusetts (Massachusetts)', supported: false },
  { id: 'ncquickpass', label: 'NC Quick Pass (North Carolina)', supported: false },
  { id: 'ezpass_nj', label: 'E-Z Pass New Jersey (New Jersey)', supported: false },
];

export const agencyLabel = (id: string) => TOLL_AGENCIES.find((a) => a.id === id)?.label ?? id.toUpperCase();

/** How a linked account reads to the host. `manual`: login saved; tolls arrive from statements until NTTA opens automatic access. */
export const TOLL_STATUS: Record<HostTollAccount['status'], { label: string; tone: 'success' | 'primary' | 'destructive' }> = {
  connected: { label: 'Connected', tone: 'success' },
  manual: { label: 'Linked', tone: 'primary' },
  disconnected: { label: 'Disconnected', tone: 'destructive' },
};

/** A car's listing state on the toll page. */
export const TOLL_CAR_STATUS: Record<string, string> = { listed: 'Listed', draft: 'Draft', paused: 'Snoozed', pending_verification: 'In review' };

export const hostTollsApi = {
  accounts: () => api.get<HostTollAccount[]>('/hosts/me/tolls/accounts'),
  account: (id: string) => api.get<HostTollAccount>(`/hosts/me/tolls/accounts/${id}`),
  link: (body: { agency: 'ntta'; nickname: string; username: string; password: string }) =>
    api.post<HostTollAccount>('/hosts/me/tolls/accounts', body),
  updateLogin: (id: string, username: string, password: string) =>
    api.raw<HostTollAccount>(`/hosts/me/tolls/accounts/${id}/login`, { method: 'PUT', body: { username, password } }).then((r) => r.data),
  setVehicles: (id: string, vehicleIds: string[]) =>
    api.raw<HostTollAccount>(`/hosts/me/tolls/accounts/${id}/vehicles`, { method: 'PUT', body: { vehicleIds } }).then((r) => r.data),
  unlink: (id: string) => api.delete<{ ok: true }>(`/hosts/me/tolls/accounts/${id}`),
};
