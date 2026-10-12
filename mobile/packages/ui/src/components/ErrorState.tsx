import { CloudOff } from 'lucide-react-native';
import { useTheme } from '../theme/theme';
import { EmptyState } from './EmptyState';

/** A calm, human failure message with a retry. Never shows technical detail. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <EmptyState
      icon={<CloudOff size={28} color={c.primary} />}
      title="This didn't load"
      body={message ?? 'Check your connection and try again.'}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}
