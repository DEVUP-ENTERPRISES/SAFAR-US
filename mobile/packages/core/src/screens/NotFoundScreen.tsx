import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { EmptyState, Screen, useTheme } from '@catodrive/ui';

/** Any link to a website feature the app doesn't have yet lands here, never on a crash. */
export function NotFoundScreen({ home = '/' }: { home?: string }) {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <Screen scroll={false} contentStyle={{ justifyContent: 'center' }}>
      <EmptyState
        icon={<Sparkles size={28} color={c.primary} />}
        title="Coming to the app soon"
        body="This part of CatoDrive is on the website for now."
        actionLabel="Go home"
        onAction={() => router.replace(home as never)}
      />
    </Screen>
  );
}
