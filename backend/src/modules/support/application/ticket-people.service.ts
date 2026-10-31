import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { personSummaries, type PersonSummary } from '../../people/application/person-summary.service';
import type { TicketDoc } from '../infrastructure/ticket.model';

const unknown = (id: string): Pick<PersonSummary, 'id' | 'name' | 'kind'> => ({ id, name: 'Deleted account', kind: 'guest' });

/** Tickets with who opened each one, for the admin queue; one batch per page. */
export async function withRequesters(tickets: TicketDoc[]) {
  const people = await personSummaries(tickets.map((t) => t.userId), { visibility: 'staff' });
  return tickets.map((t) => ({ ...t, requester: people.get(t.userId) ?? unknown(t.userId) }));
}

/** One ticket with the requester in full, who wrote each message, and the booking it is about. */
export async function withConversation(ticket: TicketDoc) {
  const people = await personSummaries([ticket.userId, ...ticket.messages.map((m) => m.authorId)], { visibility: 'staff' });
  const booking =
    ticket.relatedType === 'booking' && ticket.relatedId
      ? await BookingModel.findById(ticket.relatedId).select('_id code status period').lean<{ _id: string; code: string; status: string; period?: { start: Date; end: Date } }>()
      : null;
  return {
    ...ticket,
    requester: people.get(ticket.userId) ?? unknown(ticket.userId),
    booking: booking ? { id: booking._id, code: booking.code, status: booking.status, start: booking.period?.start, end: booking.period?.end } : null,
    messages: ticket.messages.map((m) => {
      const fromCustomer = m.authorId === ticket.userId;
      return { ...m, author: { name: people.get(m.authorId)?.name ?? (fromCustomer ? 'Customer' : 'Support'), fromCustomer } };
    }),
  };
}
