import { NotificationSettingsScreen, RequireAuth } from '@catodrive/core';

export default function Notifications() {
  return (
    <RequireAuth>
      <NotificationSettingsScreen />
    </RequireAuth>
  );
}
