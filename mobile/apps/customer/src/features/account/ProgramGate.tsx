import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { PauseCircle } from 'lucide-react-native';
import { EmptyState, Screen, ScreenHeader, Skeleton, useTheme } from '@catodrive/ui';
import { usePlatformConfig, usePrograms } from '@catodrive/core/web/features/platform/config';

/** A guest programme the admin can pause: shown as the website's "paused for now" notice while off. */
export function ProgramGate({ program, name, children }: { program: 'rewards' | 'referral' | 'membership'; name: string; children: ReactNode }) {
  const { c } = useTheme();
  const router = useRouter();
  const programs = usePrograms();
  const loading = usePlatformConfig().isPending;
  if (loading) return <Screen><Skeleton height={200} /></Screen>;
  if (programs[program]) return <>{children}</>;
  return (
    <Screen header={<ScreenHeader title={name} onBack={() => router.back()} />} contentStyle={{ justifyContent: 'center' }}>
      <EmptyState
        icon={<PauseCircle size={28} color={c.primary} />}
        title={`${name} is paused for now`}
        body="We are improving it. Anything you have already earned is safe and will be here when it returns."
        actionLabel="Browse cars"
        onAction={() => router.navigate('/search')}
      />
    </Screen>
  );
}
