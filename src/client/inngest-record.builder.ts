/** The per-event options Inngest has, which a plain `emit(pattern, data)` cannot say. */
export interface InngestRecordOptions {
  /**
   * Extra entries for the event's `user` object — the slot Inngest gives whatever should travel
   * beside the data. Headers, in other words.
   */
  readonly user?: Record<string, string>;
  /**
   * Extra **metadata**, merged into the event's `user` object before {@link user}. Kept apart from
   * `user` so a caller can set what describes the message (a tenant, a trace id) separately from
   * what describes the person, and let the second win on a shared key.
   */
  readonly metadata?: Record<string, string>;
  /**
   * Inngest **sessions**: `{ key: id }`, at most {@link InngestRecordBuilder.MAX_SESSIONS} of them.
   * They group runs in Inngest's own dashboard and change nothing about which function runs — and,
   * from inngest-js 4.18, they propagate by themselves to every event a run sends, which is what
   * makes a whole chain of runs one thing to look at.
   */
  readonly sessions?: Record<string, string | number>;
  /**
   * What makes two sends the same send. It becomes the event's `id` (`<name>:<key>`), and Inngest
   * collapses repeated sends of one id into a single run inside its deduplication window.
   */
  readonly idempotencyKey?: string;
  /** When the event should be considered to have happened — Inngest's `ts`, which also delays a run. */
  readonly ts?: number | Date;
}

/** A payload with Inngest options attached — the shape {@link InngestRecordBuilder} builds. */
export interface InngestRecord<TData = unknown> {
  readonly data: TData;
  readonly options: InngestRecordOptions;
}

/**
 * **Inngest's own options, attached to one send** — the counterpart of Nest's own record builders
 * (`RmqRecordBuilder`, `NatsRecordBuilder`, …), and the same idea: the caller composes transport
 * options without the code that publishes learning the transport.
 *
 * It is what a caller reaches for when a send must say more than its name and data: one that must
 * not run twice (an idempotency key), one that should not run yet (a timestamp in the future), one
 * that belongs to a session of its own.
 *
 * ```ts
 * client.emit('orders.placed', new InngestRecordBuilder(order)
 *   .setIdempotencyKey(order.id)
 *   .setSession('customer_id', order.customerId)
 *   .build());
 * ```
 */
export class InngestRecordBuilder<TData = unknown> {
  /** Inngest takes at most five session entries on one event. */
  static readonly MAX_SESSIONS = 5;

  private static readonly MARKER = Symbol.for(
    'nestjs-inngest-transport.inngest-record',
  );

  private options: InngestRecordOptions = {};

  /** @param data The payload the record carries. */
  constructor(private readonly data: TData) {}

  /**
   * Whether a payload carries Inngest options. A marker symbol and not a duck-typed
   * `'options' in value`, because a domain event with a property called `options` is not a
   * transport instruction.
   */
  static isRecord<TData>(value: unknown): value is InngestRecord<TData> {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as Record<symbol, unknown>)[InngestRecordBuilder.MARKER] === true
    );
  }

  /**
   * The error a set of sessions earns when it is past Inngest's limit, or `undefined` when it fits.
   *
   * @param owner What the sessions belong to, named in the message.
   * @param sessions The sessions the event would carry.
   */
  static sessionsRefusal(
    owner: string,
    sessions: Record<string, string | number>,
  ): Error | undefined {
    const keys = Object.keys(sessions);
    return keys.length > InngestRecordBuilder.MAX_SESSIONS
      ? new Error(
          `Inngest takes at most ${InngestRecordBuilder.MAX_SESSIONS} sessions on one event; ` +
            `${owner} would carry ${keys.length} (${keys.join(', ')}).`,
        )
      : undefined;
  }

  /** Merges `options` over what is already set. */
  setOptions(options: InngestRecordOptions): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  /** Merges `user` into the entries of the event's `user` object already set. */
  setUser(user: Record<string, string>): this {
    return this.setOptions({
      user: { ...(this.options.user ?? {}), ...user },
    });
  }

  /** Merges `metadata` into the envelope metadata already set. */
  setMetadata(metadata: Record<string, string>): this {
    return this.setOptions({
      metadata: { ...(this.options.metadata ?? {}), ...metadata },
    });
  }

  /**
   * Merges `sessions` into the ones already set.
   *
   * @throws When the result would carry more than {@link InngestRecordBuilder.MAX_SESSIONS}.
   */
  setSessions(sessions: Record<string, string | number>): this {
    const merged = { ...(this.options.sessions ?? {}), ...sessions };
    const refusal = InngestRecordBuilder.sessionsRefusal('this one', merged);
    if (refusal) {
      throw refusal;
    }
    return this.setOptions({ sessions: merged });
  }

  /** One session entry; see {@link InngestRecordBuilder.setSessions}. */
  setSession(key: string, id: string | number): this {
    return this.setSessions({ [key]: id });
  }

  /** What makes two sends the same send; see {@link InngestRecordOptions.idempotencyKey}. */
  setIdempotencyKey(idempotencyKey: string): this {
    return this.setOptions({ idempotencyKey });
  }

  /** When the event should be considered to have happened, which also delays a run. */
  setTimestamp(ts: number | Date): this {
    return this.setOptions({ ts });
  }

  /** The record to hand to `client.emit()` as the payload. */
  build(): InngestRecord<TData> {
    return {
      data: this.data,
      options: this.options,
      [InngestRecordBuilder.MARKER]: true,
    } as InngestRecord<TData>;
  }
}
