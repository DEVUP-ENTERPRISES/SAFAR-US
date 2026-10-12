import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { useHostMe, isNotAHost } from '@catodrive/core/web/features/host/hooks';
import { useIsAssetPartner } from '@catodrive/core/web/features/asset-partners/hooks';
import { captainApi } from '@catodrive/core/web/features/host/team-api';
import { corporateApi } from '@catodrive/core/web/features/corporate/api';

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

/** The workspace this phone last opened; kept for the session. */
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
  const corporate = useQuery({ queryKey: ['corporate-me'], queryFn: () => corporateApi.me(), enabled: signedIn, retry: false });

  const hostKnown = host.isSuccess || notAHost || (host.isError && !host.isFetching);
  const ready = signedIn && assetPartner !== undefined && hostKnown && !captain.isPending && !corporate.isPending;
  const available: Workspace[] = [];
  if (assetPartner) available.push('asset-partner');
  else if (host.isSuccess) available.push('host');
  if (captain.data) available.push('captain');
  const corpRole = corporate.data?.membership?.role;
  if (corporate.data && (corpRole === 'corp_admin' || corpRole === 'manager')) available.push('corporate');
  return { ready, available };
}
