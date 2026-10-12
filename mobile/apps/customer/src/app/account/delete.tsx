import { DeleteAccountScreen, RequireAuth } from '@catodrive/core';

export default function DeleteAccount() {
  return (
    <RequireAuth>
      <DeleteAccountScreen afterPath="/" />
    </RequireAuth>
  );
}
