import { useRouter } from 'expo-router';
import { LogIn } from 'lucide-react-native';
import { EmptyState, Screen, ScreenHeader, useTheme } from '@catodrive/ui';

/** A tab that needs an account, seen signed out: say why, offer sign-in, come back here after. */
export function SignedOutPrompt({ title, heading, body, returnTo }: { title: string; heading: string; body: string; returnTo: string }) {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <Screen header={<ScreenHeader title={title} large />}>
      <EmptyState icon={<LogIn size={28} color={c.primary} />} title={heading} body={body} actionLabel="Sign in" onAction={() => router.push({ pathname: '/login', params: { returnTo } })} />
    </Screen>
  );
}
