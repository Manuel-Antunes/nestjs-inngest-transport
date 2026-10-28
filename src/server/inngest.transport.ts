/**
 * **This transport's id**: what `InngestStrategy.transportId` is, and what binds a handler to it
 * alone — `@EventPattern(pattern, INNGEST_TRANSPORT)`, or {@link InngestEventPattern}.
 */
export const INNGEST_TRANSPORT: unique symbol = Symbol.for(
  'nestjs-inngest-transport.inngest',
) as never;
