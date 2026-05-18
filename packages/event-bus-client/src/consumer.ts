import { Kafka, type Consumer } from 'kafkajs';
import type { AeosEvent } from '@aeos/canonical-schema';
import type { TenantId } from '@aeos/canonical-schema';

export type EventHandler<T extends AeosEvent = AeosEvent> = (event: T) => Promise<void>;

export interface ConsumerOptions {
  readonly tenantId: TenantId;
  readonly groupId: string;
  readonly service: string;
}

export class AeosConsumer {
  private readonly consumer: Consumer;
  private readonly tenantId: TenantId;
  private readonly handlers = new Map<string, EventHandler>();
  private running = false;

  constructor(options: ConsumerOptions) {
    this.tenantId = options.tenantId;
    const brokers = process.env['KAFKA_BROKERS']?.split(',') ?? ['localhost:9092'];
    const kafka = new Kafka({
      clientId: `aeos-${options.service}-consumer`,
      brokers,
      ssl: process.env['KAFKA_SSL'] === 'true',
      sasl:
        process.env['KAFKA_SASL_USERNAME']
          ? {
              mechanism: 'scram-sha-512',
              username: process.env['KAFKA_SASL_USERNAME'] ?? '',
              password: process.env['KAFKA_SASL_PASSWORD'] ?? '',
            }
          : undefined,
    });
    this.consumer = kafka.consumer({ groupId: options.groupId });
  }

  on<T extends AeosEvent>(eventType: T['event_type'], handler: EventHandler<T>): this {
    this.handlers.set(eventType, handler as EventHandler);
    return this;
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    const topics = Array.from(this.handlers.keys()).map(
      (eventType) => `aeos.${this.tenantId}.${eventType.split('.')[0]}.${eventType}`,
    );
    await this.consumer.subscribe({ topics, fromBeginning: false });

    this.running = true;
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString()) as AeosEvent;
        const handler = this.handlers.get(event.event_type);
        if (handler) {
          await handler(event);
        }
      },
    });
  }

  async stop(): Promise<void> {
    if (this.running) {
      await this.consumer.disconnect();
      this.running = false;
    }
  }
}

export function createConsumer(options: ConsumerOptions): AeosConsumer {
  return new AeosConsumer(options);
}
