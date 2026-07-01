import type { ReactNode } from 'react';
import { Inbox, AlertTriangle } from 'lucide-react';

/** Reusable empty state. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <div className="text-muted-foreground">{icon ?? <Inbox className="h-10 w-10" />}</div>
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Reusable error state. */
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      {retry && (
        <button onClick={retry} className="text-sm font-medium text-primary underline">
          Try again
        </button>
      )}
    </div>
  );
}
