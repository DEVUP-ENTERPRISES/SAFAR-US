import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Screen, SkeletonList } from '@catodrive/ui';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { WORKSPACE_HOME, useWorkspaceChoice, useWorkspaces } from '@/features/workspace/workspaces';
import { GetStarted } from '@/features/workspace/GetStarted';

/** Opens the right workspace: the last one used this session, else the account's first; with none, sets one up. */
export default function Start() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const { ready, available } = useWorkspaces();
  const chosen = useWorkspaceChoice((s) => s.current);

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
  return <GetStarted />;
}
