import { Logger } from '@nestjs/common';
import type {
  ProducerSerializer,
  ReadPacket,
  WritePacket,
} from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import type { Inngest } from 'inngest';
import type { InngestOutgoingEvent } from '../shared/inngest-event';
import { InngestEvent } from '../shared/inngest-event';
import type { InngestRecordOptions } from './inngest-record.builder';
import { InngestRecordBuilder } from './inngest-record.builder';

export interface InngestClientProxyOptions {
  /**
   * The Inngest client the events are sent through — usually the very instance the
   * {@link InngestStrategy} creates its functions on, so both show up under one app in Inngest.
   */
  readonly inngest: Inngest.Any;
  /**
   * **How a packet becomes an event** — see {@link InngestOutgoingEvent}. Left out, Nest's own
   * `IdentitySerializer` applies: the pattern is the event's name and the data is its `data`.
   */
  readonly serializer?: ProducerSerializer;
}

/**
 * **The `ClientProxy` for Inngest: the event is the message, and the function is the binding.**
 *
 * It is the outbound half of {@link InngestStrategy}, and the mapping to the other transports is
 * close enough to be worth stating:
 *
 * | AWS | Inngest |
 * |---|---|
 * | the topic | the Inngest app — one place every event is sent to |
 * | a subscription's filter policy | a function's **triggers**, resolved at boot |
 * | the routing key attribute | the event **name**, which carries no aggregate |
 * | the message attributes | the event's `user` — or the data, when it is an envelope that carries its own headers |
 *
 * What a caller can add per send is {@link InngestRecordBuilder}: `user` entries, metadata, sessions,
 * an idempotency key, a timestamp.
 *
 * ```ts
 * const proxy = new InngestClientProxy({ inngest });
 * proxy.emit('orders.placed', new InngestRecordBuilder(payload).build());
 * ```
 */
export class InngestClientProxy extends ClientProxy {
  private readonly logger = new Logger(InngestClientProxy.name);

  private readonly client: Inngest.Any;

  /**
   * @param options The Inngest client, and optionally a serializer.
   * @throws When there is no client: a proxy without one would accept every publish and deliver none.
   */
  constructor(options: InngestClientProxyOptions) {
    super();
    this.client = options.inngest;
    if (!this.client) {
      throw new Error(
        'InngestClientProxy needs an inngest client: it is the destination, and a client without ' +
          'one would accept every publish and deliver none.',
      );
    }
    this.initializeSerializer(options);
  }

  /** There is no connection to hold: each send is one HTTP request, so there is nothing to open. */
  async connect(): Promise<void> {}

  /** The client holds nothing this proxy opened. */
  async close(): Promise<void> {}

  /** The Inngest client, for a caller that needs something the proxy does not offer. */
  unwrap<T = Inngest.Any>(): T {
    return this.client as T;
  }

  protected publish(
    packet: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): () => void {
    callback({
      err: new Error(
        `An Inngest event triggers functions and gets no reply, so send() on ` +
          `'${String(packet.pattern)}' cannot be answered. Use emit() instead.`,
      ),
    });
    return () => undefined;
  }

  protected async dispatchEvent<T = unknown>(packet: ReadPacket): Promise<T> {
    const record = InngestRecordBuilder.isRecord(packet.data)
      ? packet.data
      : undefined;
    const options: InngestRecordOptions = record?.options ?? {};
    const unwrapped = record ? { ...packet, data: record.data } : packet;
    const message = InngestEvent.outgoing(
      await this.serializer.serialize(unwrapped),
      unwrapped,
    );

    await this.client.send(this.eventOf(message, options));

    this.logger.debug(`${message.name} → inngest`);
    return undefined as T;
  }

  private eventOf(
    message: InngestOutgoingEvent,
    options: InngestRecordOptions,
  ): Parameters<Inngest.Any['send']>[0] {
    const sessions = {
      ...(message.meta?.sessions ?? {}),
      ...(options.sessions ?? {}),
    };
    const refusal = InngestRecordBuilder.sessionsRefusal(
      message.name,
      sessions,
    );
    if (refusal) {
      throw refusal;
    }

    return {
      name: message.name,
      data: message.data,
      user: {
        ...message.user,
        ...(options.metadata ?? {}),
        ...(options.user ?? {}),
      },
      ...(Object.keys(sessions).length > 0 ? { meta: { sessions } } : {}),
      ...(options.idempotencyKey
        ? { id: `${message.name}:${options.idempotencyKey}` }
        : {}),
      ...(options.ts === undefined
        ? {}
        : {
            ts: options.ts instanceof Date ? options.ts.getTime() : options.ts,
          }),
    } as Parameters<Inngest.Any['send']>[0];
  }
}
