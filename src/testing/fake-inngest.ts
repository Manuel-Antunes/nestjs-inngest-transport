import type { Inngest } from 'inngest';

/** A function a {@link FakeInngest} was asked to create: its configuration and the handler it was given. */
export interface CreatedFunction {
  readonly config: Record<string, unknown>;
  readonly handler: (context: unknown) => Promise<unknown>;
}

/**
 * **An Inngest client that records what it was asked to send and which functions it was asked to
 * create** — for a unit test of code that publishes through {@link InngestClientProxy}, or of a
 * strategy's bindings, with no Inngest dev server.
 *
 * ```ts
 * const inngest = new FakeInngest();
 * const client = new InngestClientProxy({ inngest: inngest.asClient() });
 * await lastValueFrom(client.emit('orders.placed', { id: 'o-1' }));
 * expect(inngest.sent).toEqual([expect.objectContaining({ name: 'orders.placed' })]);
 * ```
 */
export class FakeInngest {
  /** Every event `send()` was given, in order. A batch send records each event. */
  readonly sent: Record<string, unknown>[] = [];
  /** Every function `createFunction()` was asked for, in order. */
  readonly created: CreatedFunction[] = [];

  async send(
    event: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<{ ids: string[] }> {
    const events = Array.isArray(event) ? event : [event];
    this.sent.push(...events);
    return {
      ids: events.map(
        (_, index) => `fake-${this.sent.length - events.length + index}`,
      ),
    };
  }

  /** The function created for `id`, to call its handler directly. */
  functionWithId(id: string): CreatedFunction | undefined {
    return this.created.find((created) => created.config.id === id);
  }

  /** Forgets what was sent and created. */
  reset(): void {
    this.sent.length = 0;
    this.created.length = 0;
  }

  createFunction(
    config: Record<string, unknown>,
    handler: CreatedFunction['handler'],
  ): CreatedFunction {
    const created = { config, handler };
    this.created.push(created);
    return created;
  }

  /** This fake as the `Inngest` client a proxy or a strategy takes. */
  asClient(): Inngest.Any {
    return this as unknown as Inngest.Any;
  }
}
