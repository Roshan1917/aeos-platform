import { Kafka, type Producer } from 'kafkajs';
import type { AeosEvent } from '@aeos/canonical-schema';
import type { TenantId } from '@aeos/canonical-schema';
import { topicName } from './topic.js';

export interface ProducerOptions {
  readonly tenantId: TenantId;
  readonly service: string;
}

export class AeosProducer {
  private readonly producer: Producer;
  private readonly tenantId: TenantId;
  private connected = false;

  constructor(options: ProducerOptions) {
    this.tenantId = options.tenantId;
    const brokers = process.env['KAFKA_BROKERS']?.split(',') ?? ['localhost:9092'];
    const kafka = new Kafka({
      clientId: `aeos-${options.service}-producer`,
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
    this.producer = kafka.producer();
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async publish(event: AeosEvent): Promise<void> {
    await this.connect();
    const topic = topicName(this.tenantId, event.event_type);
    await this.producer.send({
      topic,
      messages: [
        {
          key: event.event_id,
          value: JSON.stringify(event),
          headers: {
            'aeos-schema-version': '1.0',
            'aeos-event-type': event.event_type,
            'aeos-tenant-id': this.tenantId,
          },
        },
      ],
    });
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }
}

export function createProducer(options: ProducerOptions): AeosProducer {
  return new AeosProducer(options);
}
