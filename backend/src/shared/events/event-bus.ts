import { EventEmitter } from 'events';
import type { DomainEvent, EventName } from '../../core/events/event-names';
import { logger } from '../../infrastructure/logging/logger';

type Handler = (event: DomainEvent) => void | Promise<void>;

/**
 * In-process pub/sub. Publishers emit domain facts; subscribers react.
 * Handlers run asynchronously and are isolated — one failing handler never
 * breaks the publisher or other handlers (side effects are eventual).
 *
 * This is the seam that lets modules stay decoupled now and lets us swap in
 * a durable broker (BullMQ/Kafka) later without changing publishers.
 */
class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  subscribe(name: EventName, handler: Handler): void {
    this.emitter.on(name, (event: DomainEvent) => {
      Promise.resolve(handler(event)).catch((err) =>
        logger.error({ err, event: name }, 'Event handler failed'),
      );
    });
  }

  publish<T>(event: DomainEvent<T>): void {
    logger.debug({ event: event.name, aggregateId: event.aggregateId }, 'event published');
    this.emitter.emit(event.name, event);
  }
}

export const eventBus = new EventBus();

export function emit<T>(
  name: EventName,
  aggregateId: string,
  payload: T,
  correlationId?: string,
): void {
  eventBus.publish<T>({ name, aggregateId, payload, occurredAt: new Date(), correlationId });
}
