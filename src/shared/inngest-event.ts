import type { ReadPacket } from '@nestjs/microservices';

/**
 * **What a serializer hands {@link InngestClientProxy}**: an Inngest event, ready to send.
 *
 * A custom serializer may answer this shape to choose the event's name, `user` entries or sessions
 * itself. Anything else it answers — Nest's own `IdentitySerializer` included — is read as the
 * packet: the pattern is the name and the data is the data.
 */
export interface InngestOutgoingEvent {
  readonly name: string;
  readonly data: Record<string, unknown>;
  readonly user?: Readonly<Record<string, string>>;
  readonly meta?: { readonly sessions?: Record<string, string | number> };
}

/** **How a Nest packet becomes the event Inngest is sent.** */
export class InngestEvent {
  /**
   * A serializer's answer, as the proxy sends it.
   *
   * @param serialized What the proxy's serializer answered.
   * @param packet The packet that was serialized, read when the answer is not an event.
   */
  static outgoing(
    serialized: unknown,
    packet: ReadPacket,
  ): InngestOutgoingEvent {
    return InngestEvent.isOutgoing(serialized)
      ? serialized
      : {
          name: String(packet.pattern),
          data: InngestEvent.dataOf(packet.data),
        };
  }

  /**
   * Inngest only takes an object as an event's `data`, so anything else is wrapped as `{ value }`.
   * An array is not an object to Inngest either.
   */
  static dataOf(data: unknown): Record<string, unknown> {
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { value: data };
  }

  private static isOutgoing(value: unknown): value is InngestOutgoingEvent {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { name?: unknown }).name === 'string' &&
      typeof (value as { data?: unknown }).data === 'object'
    );
  }
}
