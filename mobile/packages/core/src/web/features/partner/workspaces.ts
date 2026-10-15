// Generated from frontend/src/features/partner/workspaces.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { useAuthStore } from '../auth/store';
import { useHostMe, isNotAHost } from '../host/hooks';
import { useIsAssetPartner } from '../asset-partners/hooks';
import { captainApi } from '../host/team-api';
import { corporateApi } from '../corporate/api';
import { config } from '../../lib/config';

export type Workspace = 'asset-partner' | 'host' | 'captain' | 'corporate';

export const WORKSPACE_HOME: Record<Workspace, string> = {
  'asset-partner': '/asset-partners/dashboard',
  host: '/host',
  captain: '/captain',
  corporate: '/corporate',
};

export const WORKSPACE_LABEL: Record<Workspace, string> = {
  'asset-partner': 'Asset Partner',
  host: 'Host',
  captain: 'Captain',
  corporate: 'Corporate',
};

/** The workspace last opened in this session (phone or browser tab). */
export const useWorkspaceChoice = create<{ current: Workspace | null; set: (w: Workspace) => void }>((set) => ({
  current: null,
  set: (current) => set({ current }),
}));

/**
 * Which partner workspaces this account has, the website's portal checks in
 * one place. An asset partner also has a host record underneath, so being an
 * asset partner wins over hosting, exactly as the host portal redirects them.
 * `ready` is false while any answer is still loading.
 */
export function useWorkspaces(): { ready: boolean; available: Workspace[] } {
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const assetPartner = useIsAssetPartner();
  const host = useHostMe();
  const notAHost = isNotAHost(host.error);
  const captain = useQuery({ queryKey: ['captain-queue'], queryFn: () => captainApi.queue(), enabled: signedIn, retry: false });
  // Corporate ships in version 3; until then it is never offered as a workspace.
  const corporate = useQuery({ queryKey: ['corporate-me'], queryFn: () => corporateApi.me(), enabled: signedIn && config.corporate, retry: false });

  const hostKnown = host.isSuccess || notAHost || (host.isError && !host.isFetching);
  const ready = signedIn && assetPartner !== undefined && hostKnown && !captain.isPending && (!config.corporate || !corporate.isPending);
  const available: Workspace[] = [];
  if (assetPartner) available.push('asset-partner');
  else if (host.isSuccess) available.push('host');
  if (captain.data) available.push('captain');
  const corpRole = corporate.data?.membership?.role;
  if (corporate.data && (corpRole === 'corp_admin' || corpRole === 'manager')) available.push('corporate');
  return { ready, available };
}
