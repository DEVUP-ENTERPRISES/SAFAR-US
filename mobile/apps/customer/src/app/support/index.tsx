import { RequireAuth, SupportScreen } from '@catodrive/core';

export default function Support() {
  return (
    <RequireAuth>
      <SupportScreen />
    </RequireAuth>
  );
}
