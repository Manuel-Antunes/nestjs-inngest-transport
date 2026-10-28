import { BaseRpcContext } from '@nestjs/microservices';
import type { EventPayload, GetStepTools, Inngest } from 'inngest';

/** Inngest's step tools, as a handler gets them. */
export type InngestStepTools = GetStepTools<Inngest.Any>;

/** What an {@link InngestContext} is built from. */
export type InngestContextArgs = [
  event: EventPayload,
  pattern: string,
  step: InngestStepTools,
  runId: string,
  attempt: number,
  events?: EventPayload[],
];

/**
 * **What a handler can ask about the run it is inside** — `@Ctx()` on this transport: the event as
 * it arrived, the pattern that matched it, and what only Inngest has: the step tools, the run, the
 * attempt.
 *
 * ```ts
 * @EventPattern('orders.placed')
 * async place(@Payload() order: Order, @Ctx() context: InngestContext) {
 *   const step = context.getStep();
 *   await step.run('reserve-stock', () => this.stock.reserve(order));
 *   await step.sleep('cool-off', '1h');
 *   await step.run('email', () => this.mailer.confirm(order));
 * }
 * ```
 */
export class InngestContext extends BaseRpcContext<InngestContextArgs> {
  /** @param args The event, the pattern, the step tools, the run id, the attempt and the batch. */
  constructor(args: InngestContextArgs) {
    super(args);
  }

  /** The event as Inngest delivered it — the first of the batch when the function batches. */
  getEvent(): EventPayload {
    return this.args[0];
  }

  /** The pattern the function was bound for — what the controller declared, not the event's name. */
  getPattern(): string {
    return this.args[1];
  }

  /** Inngest's step tools: `step.run`, `step.sleep`, `step.waitForEvent`, `step.sendEvent`, … */
  getStep(): InngestStepTools {
    return this.args[2];
  }

  /** Inngest's identifier for this run. */
  getRunId(): string {
    return this.args[3];
  }

  /** Zero on the first attempt. Inngest owns the retrying; this is only how to read where it is. */
  getAttempt(): number {
    return this.args[4];
  }

  /** Inngest's identifier for the event, when it carries one. */
  getEventId(): string | undefined {
    return this.args[0].id;
  }

  /** The event's name — one of the names the pattern stands for. */
  getEventName(): string {
    return this.args[0].name;
  }

  /** Every event of the run: one, unless the function sets `batchEvents`. */
  getEvents(): EventPayload[] {
    return this.args[5] ?? [this.args[0]];
  }
}
