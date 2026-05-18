import type { AeosEvent, TenantId } from '@aeos/canonical-schema';

export type EventHandler<T extends AeosEvent = AeosEvent> = (event: T) => Promise<void>;

export interface PublishedMessage {
  topic: string;
  event: AeosEvent;
}

/**
 * In-memory drop-in for AeosProducer. No Kafka connection required.
 * Inspect `published` to assert events in tests.
 */
export class MockProducer {
  readonly published: PublishedMessage[] = [];
  readonly tenantId: TenantId;

  constructor(options: { tenantId: TenantId; service?: string }) {
    this.tenantId = options.tenantId;
  }

  async connect(): Promise<void> {
    // no-op
  }

  async publish(event: AeosEvent): Promise<void> {
    const topic = `aeos.${this.tenantId}.${event.event_type.split('.')[0]}.${event.event_type}`;
    this.published.push({ topic, event });
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  /** Return all events of a given type, in publish order. */
  eventsOfType<T extends AeosEvent>(eventType: T['event_type']): T[] {
    return this.published
      .filter((m) => m.event.event_type === eventType)
      .map((m) => m.event as T);
  }

  /** Assert at least one event of this type was published. */
  assertPublished(eventType: string): void {
    const found = this.published.some((m) => m.event.event_type === eventType);
    if (!found) {
      throw new Error(
        `Expected event '${eventType}' to be published. ` +
          `Got: [${this.published.map((m) => m.event.event_type).join(', ')}]`,
      );
    }
  }

  /** Reset published events between tests. */
  reset(): void {
    this.published.splice(0);
  }
}

/**
 * In-memory drop-in for AeosConsumer. No Kafka connection required.
 * Call `inject(event)` to simulate receiving a message.
 */
export class MockConsumer {
  private readonly handlers = new Map<string, EventHandler>();
  readonly tenantId: TenantId;

  constructor(options: { tenantId: TenantId; groupId?: string; service?: string }) {
    this.tenantId = options.tenantId;
  }

  on<T extends AeosEvent>(eventType: T['event_type'], handler: EventHandler<T>): this {
    this.handlers.set(eventType, handler as EventHandler);
    return this;
  }

  async start(): Promise<void> {
    // no-op — handlers fire via inject()
  }

  async stop(): Promise<void> {
    // no-op
  }

  /**
   * Simulate receiving an event from Kafka.
   * Calls the registered handler for the event type (if any).
   */
  async inject(event: AeosEvent): Promise<void> {
    const handler = this.handlers.get(event.event_type);
    if (handler) {
      await handler(event);
    }
  }

  /** Inject multiple events in sequence. */
  async injectAll(events: AeosEvent[]): Promise<void> {
    for (const event of events) {
      await this.inject(event);
    }
  }
}

export function createMockProducer(options: {
  tenantId: TenantId;
  service?: string;
}): MockProducer {
  return new MockProducer(options);
}

export function createMockConsumer(options: {
  tenantId: TenantId;
  groupId?: string;
  service?: string;
}): MockConsumer {
  return new MockConsumer(options);
}
