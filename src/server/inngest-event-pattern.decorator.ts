import { EventPattern } from '@nestjs/microservices';
import { INNGEST_TRANSPORT } from './inngest.transport';
import type { InngestFunctionConfig } from './inngest-functions';

/**
 * **`@EventPattern` for this transport**: the handler becomes an Inngest function, configured with
 * `config`.
 *
 * ```ts
 * @InngestEventPattern('orders.paid', { concurrency: { limit: 1 }, retries: 2 })
 * charge(@Payload() order: Order, @Ctx() context: InngestContext) {}
 * ```
 *
 * Three things set it apart from `@EventPattern(pattern, { inngest: config })`, which works too:
 * the configuration is type-checked against Inngest's own types, the handler is bound to this
 * transport alone — a hybrid application running another transport beside it does not get it —
 * and NestJS 12's typed `@EventPattern`, which refuses a typed `@Ctx()` parameter under
 * `strictFunctionTypes`, is not in the way.
 */
export function InngestEventPattern(
  pattern: string,
  config?: InngestFunctionConfig,
): MethodDecorator {
  return EventPattern<string>(
    pattern,
    INNGEST_TRANSPORT,
    config ? { inngest: config } : {},
  );
}
