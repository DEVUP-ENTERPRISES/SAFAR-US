import { RequireAuth, TicketScreen } from '@catodrive/core';

export default function Ticket() {
  return (
    <RequireAuth>
      <TicketScreen />
    </RequireAuth>
  );
}
