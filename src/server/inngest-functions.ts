import type { Logger } from '@nestjs/common';
import type { EventPayload, Inngest, InngestFunction } from 'inngest';

import type { InngestTriggerResolver } from '../shared/inngest-triggers';
import { InngestTriggers } from '../shared/inngest-triggers';
import type { InngestStepTools } from './inngest.context';

/**
 * **An Inngest function's own configuration**, as `inngest.createFunction()` takes it: `retries`,
 * `concurrency`, `throttle`, `rateLimit`, `debounce`, `idempotency`, `priority`, `timeouts`,
 * `cancelOn`, `batchEvents`, … The triggers are the transport's to decide, and `onFailure` has no
 * Nest handler to call, so neither can be set here.
 */
export type InngestFunctionConfig = Partial<
  Omit<InngestFunction.Options, 'triggers' | 'onFailure'>
>;

/**
 * **What an `@EventPattern` can say about the function it becomes**, in its `extras`:
 *
 * ```ts
 * @EventPattern('orders.placed', { inngest: { concurrency: { limit: 5 }, retries: 2 } })
 * ```
 */
export interface InngestPatternExtras {
  readonly inngest?: InngestFunctionConfig;
}

/** What one run of a function does: the handler the pattern was bound for, given what Inngest brought. */
export type InngestRun = (
  pattern: string,
  event: EventPayload,
  step: InngestStepTools,
  runId: string,
  attempt: number,
  events: EventPayload[],
) => Promise<unknown>;

/** What the functions are created from. */
export interface InngestFunctionsOptions {
  /** The Inngest client the functions are created on. */
  readonly inngest: Inngest.Any;
  /** What a pattern stands for as event names; {@link InngestTriggers.literal} when left out. */
  readonly triggers?: InngestTriggerResolver;
  /** Every function's `retries`; Inngest's default when left out. */
  readonly retries?: number;
  /** Every function's configuration, or a function of the pattern that answers it. */
  readonly functionConfig?:
    | InngestFunctionConfig
    | ((pattern: string) => InngestFunctionConfig | undefined);
}

/**
 * **One Inngest function per binding, created once at boot.**
 *
 * It resolves each pattern into event names, shares the names between the bindings
 * ({@link InngestTriggers.claim}) so one event is one run, refuses a function that would carry more
 * triggers than Inngest takes, and warns of a binding left with none — a handler nothing will ever
 * trigger.
 */
export class InngestFunctions {
  private readonly byPattern = new Map<string, InngestFunction.Any>();
  private readonly triggersByPattern = new Map<string, string[]>();

  /**
   * @param options The client, the trigger resolver and the functions' configuration.
   * @param run What a run does.
   * @param logger Where a binding with no triggers is warned about.
   * @param extrasOf The configuration a binding's own `@EventPattern` extras ask for.
   */
  constructor(
    private readonly options: InngestFunctionsOptions,
    private readonly run: InngestRun,
    private readonly logger: Logger,
    private readonly extrasOf: (
      pattern: string,
    ) => InngestFunctionConfig | undefined = () => undefined,
  ) {}

  /** How many functions were created. */
  get size(): number {
    return this.byPattern.size;
  }

  /** The functions, in the order their patterns were bound. */
  all(): InngestFunction.Any[] {
    return [...this.byPattern.values()];
  }

  /** The functions by the pattern each was bound for. */
  byBinding(): ReadonlyMap<string, InngestFunction.Any> {
    return this.byPattern;
  }

  /** The event names each function was given, by pattern. */
  triggers(): ReadonlyMap<string, readonly string[]> {
    return this.triggersByPattern;
  }

  /**
   * Creates the functions for `patterns`.
   *
   * @throws When a pattern stands for more event names than {@link InngestTriggers.MAX}, or two
   * bindings would create functions with the same id.
   */
  create(patterns: readonly string[]): void {
    const claimed = InngestTriggers.claim(
      patterns,
      this.options.triggers ?? InngestTriggers.literal,
    );
    const ids = new Map<string, string>();
    for (const [pattern, triggers] of claimed) {
      if (triggers.length === 0) {
        this.logger.warn(
          `'${pattern}' stands for no event name another binding has not already claimed, so no ` +
            'Inngest function was created for it — nothing will ever trigger this handler.',
        );
        continue;
      }
      if (triggers.length > InngestTriggers.MAX) {
        throw new Error(
          `'${pattern}' stands for ${triggers.length} event names and Inngest takes at most ` +
            `${InngestTriggers.MAX} triggers on one function (${triggers.join(', ')}). Bind the ` +
            'events this service reacts to, one pattern each, instead of the whole namespace.',
        );
      }
      const config = this.configOf(pattern, triggers);
      const taken = ids.get(String(config.id));
      if (taken) {
        throw new Error(
          `'${taken}' and '${pattern}' would both create the Inngest function '${String(config.id)}'. ` +
            'Give one of them an id of its own: `@EventPattern(pattern, { inngest: { id } })`.',
        );
      }
      ids.set(String(config.id), pattern);
      this.triggersByPattern.set(pattern, triggers);
      this.byPattern.set(pattern, this.functionFor(pattern, config));
    }
  }

  /** Forgets every function. */
  clear(): void {
    this.byPattern.clear();
    this.triggersByPattern.clear();
  }

  /** `pattern → n` for each function, for the line the strategy logs when it starts. */
  summary(): string {
    return [...this.byPattern.keys()]
      .map(
        (pattern) =>
          `${pattern} → ${this.triggersByPattern.get(pattern)?.length}`,
      )
      .join(', ');
  }

  private configOf(
    pattern: string,
    triggers: string[],
  ): InngestFunctionConfig & { triggers: { event: string }[] } {
    const shared =
      typeof this.options.functionConfig === 'function'
        ? this.options.functionConfig(pattern)
        : this.options.functionConfig;
    return {
      id: InngestTriggers.functionId(pattern),
      name: `Handle ${pattern}`,
      ...(this.options.retries === undefined
        ? {}
        : { retries: this.options.retries }),
      ...(shared ?? {}),
      ...(this.extrasOf(pattern) ?? {}),
      triggers: triggers.map((event) => ({ event })),
    } as InngestFunctionConfig & { triggers: { event: string }[] };
  }

  private functionFor(
    pattern: string,
    config: InngestFunctionConfig,
  ): InngestFunction.Any {
    return this.options.inngest.createFunction(
      config as never,
      (async ({
        event,
        events,
        step,
        runId,
        attempt,
      }: {
        event: EventPayload;
        events?: EventPayload[];
        step: InngestStepTools;
        runId: string;
        attempt: number;
      }) =>
        this.run(
          pattern,
          event,
          step,
          runId,
          attempt,
          events ?? [event],
        )) as never,
    );
  }
}
