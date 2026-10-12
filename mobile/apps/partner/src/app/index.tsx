import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Store } from 'lucide-react-native';
import { Button, EmptyState, Screen, SkeletonList, useTheme } from '@catodrive/ui';
import { openInAppBrowser, useSignOut, webUrl } from '@catodrive/core';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { WORKSPACE_HOME, useWorkspaceChoice, useWorkspaces } from '@/features/workspace/workspaces';

/** Opens the right workspace: the last one used this session, else the account's first. */
export default function Start() {
  const { c } = useTheme();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const { ready, available } = useWorkspaces();
  const chosen = useWorkspaceChoice((s) => s.current);
  const { signOut, pending } = useSignOut('/login');

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (!ready || available.length === 0) return;
    const target = chosen && available.includes(chosen) ? chosen : available[0];
    router.replace(WORKSPACE_HOME[target] as never);
  }, [ready, available, chosen, router]);

  if (status !== 'authenticated' || !ready || available.length > 0) {
    return (
      <Screen>
        <SkeletonList rows={3} />
      </Screen>
    );
  }
  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <EmptyState
        icon={<Store size={28} color={c.primary} />}
        title="No partner workspace on this account"
        body="This app is for CatoDrive hosts, asset partners, captains and corporate admins. To rent a car, use the CatoDrive app."
        actionLabel="Become a partner"
        onAction={() => void openInAppBrowser(webUrl('/asset-partners'))}
      />
      <Button title="Sign out" variant="ghost" loading={pending} onPress={() => void signOut()} />
    </Screen>
  );
}
