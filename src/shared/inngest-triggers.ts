/**
 * **How a handler's pattern becomes the event names Inngest triggers on.**
 *
 * Inngest matches a trigger by exact name and has no wildcards, so whatever a pattern stands for
 * has to be spelled out when the functions are created. A resolver answers, for one pattern, the
 * event names it stands for — an empty list when it stands for none.
 *
 * ```ts
 * const catalog = { 'orders.#': ['orders.placed', 'orders.paid', 'orders.shipped'] };
 * const triggers: InngestTriggerResolver = (pattern) =>
 *   catalog[pattern] ?? InngestTriggers.literal(pattern);
 * ```
 */
export type InngestTriggerResolver = (pattern: string) => string[];

/**
 * **Patterns, triggers and function ids**: what Inngest can be told about a binding, and how the
 * bindings of one service share the event names between them.
 */
export class InngestTriggers {
  /** Inngest takes at most ten unique triggers on one function. */
  static readonly MAX = 10;

  private static readonly ONE_SEGMENT = '.*';

  /**
   * The default resolution, which needs nothing but the pattern:
   *
   * | `@EventPattern(...)` | triggers |
   * |---|---|
   * | `orders.placed` | `orders.placed` |
   * | `orders.placed.*` | `orders.placed` — a trailing one-segment wildcard is dropped |
   * | `orders.#`, `orders.*.eu` | none: a wildcard in the middle stands for a list only a catalog can write |
   *
   * The trailing `.*` is accepted so that a service whose patterns were written for a routing-key
   * broker (AMQP, SNS filter policies, `orders.placed.<entity id>`) keeps them unchanged. Anything
   * else with a wildcard needs a resolver of the application's own — see {@link InngestTriggerResolver}.
   *
   * It is a plain function, so it can be passed as a resolver as it is.
   */
  static literal(this: void, pattern: string): string[] {
    const name = pattern.endsWith(InngestTriggers.ONE_SEGMENT)
      ? pattern.slice(0, -InngestTriggers.ONE_SEGMENT.length)
      : pattern;
    return name.includes('#') || name.includes('*') ? [] : [name];
  }

  /**
   * **Each event name goes to ONE function: the most specific binding that asked for it.**
   *
   * On a broker, a queue receives one copy of a message however many of its bindings match, and the
   * server hands it to one handler. On Inngest, every function whose triggers include a name gets a
   * run of its own — so a service bound to both `orders.#` and `orders.placed` would handle every
   * `orders.placed` twice. Claiming each name for one pattern keeps it one delivery: a literal
   * pattern first, then the one that stands for fewer names, then registration order.
   *
   * @param patterns Every pattern the service bound, in registration order.
   * @param resolve How a pattern becomes event names.
   * @returns For each pattern, the names it was given; empty when other bindings claimed them all.
   */
  static claim(
    patterns: readonly string[],
    resolve: InngestTriggerResolver,
  ): Map<string, string[]> {
    const resolved = new Map(
      patterns.map((pattern) => [pattern, resolve(pattern)] as const),
    );
    const breadthOf = (pattern: string): number =>
      InngestTriggers.isLiteral(pattern)
        ? -1
        : (resolved.get(pattern)?.length ?? 0);
    const ordered = [...patterns].sort(
      (left, right) => breadthOf(left) - breadthOf(right),
    );
    const claimed = new Map<string, string>();
    for (const pattern of ordered) {
      for (const name of resolved.get(pattern) ?? []) {
        if (!claimed.has(name)) {
          claimed.set(name, pattern);
        }
      }
    }
    return new Map(
      patterns.map((pattern) => [
        pattern,
        [...new Set(resolved.get(pattern) ?? [])].filter(
          (name) => claimed.get(name) === pattern,
        ),
      ]),
    );
  }

  /** A function id Inngest accepts, derived from the pattern it was bound for. */
  static functionId(pattern: string): string {
    return pattern
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  private static isLiteral(pattern: string): boolean {
    return !pattern.includes('#') && !pattern.includes('*');
  }
}
