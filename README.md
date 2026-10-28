<h1 align="center">nestjs-inngest-transport</h1>

<p align="center">
  <strong>Inngest as a NestJS microservice transport.</strong><br/>
  Your <code>@EventPattern</code> handlers become durable Inngest functions; a <code>ClientProxy</code> sends the events.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nestjs-inngest-transport"><img alt="npm" src="https://img.shields.io/npm/v/nestjs-inngest-transport.svg"></a>
  <a href="https://github.com/Manuel-Antunes/nestjs-inngest-transport/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Manuel-Antunes/nestjs-inngest-transport/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://manuel-antunes.github.io/nestjs-inngest-transport/"><img alt="docs" src="https://img.shields.io/badge/docs-docusaurus-3ECC5F"></a>
  <a href="./LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

---

```ts
@Controller()
export class OrdersHandler {
  @InngestEventPattern('orders.placed', { concurrency: { limit: 5 } })
  async place(@Payload() order: Order, @Ctx() context: InngestContext) {
    const step = context.getStep();
    await step.run('reserve-stock', () => this.stock.reserve(order));
    await step.sleep('cool-off', '1h');
    await step.run('confirm', () => this.mailer.confirm(order));
  }
}
```

That handler is an [Inngest](https://www.inngest.com) function: triggered by the `orders.placed`
event, retried on failure, each step run once and memoized, with guards, pipes, interceptors and
filters applied exactly as on any other Nest transport.

## Why

Nest's microservices give you one programming model — `@EventPattern`, `@Payload()`, `@Ctx()`,
`ClientProxy.emit()` — over many brokers. This package adds Inngest to that list, so a service can
move to Inngest (or away from it) by changing its bootstrap and nothing else, and still get what
Inngest adds on top of a queue: durable steps, sleeps, retries with backoff, concurrency and
throttling, debouncing, idempotency and a dashboard of every run.

## Install

```bash
npm install nestjs-inngest-transport inngest
```

Peer dependencies: `@nestjs/common` and `@nestjs/microservices` 11.1+ or 12, `inngest` 4, `rxjs` 7.
Node.js 22.12 or newer. Works on Express and Fastify.

## Receive

Inngest **calls** your service over HTTP, so the strategy mounts on the host application's HTTP
server (at `/api/inngest`) — start it before the application listens:

```ts
import { NestFactory } from '@nestjs/core';
import { Inngest } from 'inngest';
import { InngestStrategy } from 'nestjs-inngest-transport';

const inngest = new Inngest({ id: 'orders' });

const app = await NestFactory.create(AppModule);
app.connectMicroservice({
  strategy: new InngestStrategy({ inngest, httpAdapter: app.getHttpAdapter() }),
});
await app.startAllMicroservices(); // before listen()
await app.listen(3000);
```

## Send

```ts
import { ClientsModule } from '@nestjs/microservices';
import { InngestClientProxy, InngestRecordBuilder } from 'nestjs-inngest-transport';

@Module({
  imports: [
    ClientsModule.register([
      { name: 'EVENTS', customClass: InngestClientProxy, options: { inngest } },
    ]),
  ],
})
export class CheckoutModule {}

// in a provider
await lastValueFrom(this.events.emit('orders.placed', order));

// with Inngest's own options
await lastValueFrom(
  this.events.emit(
    'orders.placed',
    new InngestRecordBuilder(order).setIdempotencyKey(order.id).build(),
  ),
);
```

## Keep Inngest's errors intact

Nest's default RPC exception filter turns every error into `{ status: 'error', message: 'Internal server error' }`,
so a `NonRetriableError` would be retried and a `RetryAfterError` would lose its delay. Apply
`InngestExceptionFilter` to your Inngest controllers:

```ts
@Controller()
@UseFilters(InngestExceptionFilter)
export class OrdersHandler {}
```

## What else is in the box

| | |
|---|---|
| `InngestStrategy` | the server: one Inngest function per `@EventPattern`, mounted on Express or Fastify |
| `@InngestEventPattern(pattern, config?)` | `@EventPattern` for this transport, with the function's configuration type-checked |
| `InngestClientProxy` | the client: `emit()` sends an Inngest event (`send()` is refused — events get no reply) |
| `InngestRecordBuilder` | per-send options: idempotency key, timestamp/delay, sessions, `user` entries |
| `InngestContext` | `@Ctx()`: the event, the step tools, the run id, the attempt, the batch |
| `InngestExceptionFilter` | lets `NonRetriableError`, `RetryAfterError` and every other error reach Inngest as itself |
| `InngestTriggers` | how patterns become event names: `orders.placed.*` routing keys, custom resolvers for `orders.#` |
| `nestjs-inngest-transport/testing` | `FakeInngest`, a client that records sends and created functions |

## Documentation

The full guide — patterns and triggers, function configuration, steps, errors and retries,
Express vs Fastify, deployment, testing, troubleshooting and the API reference — is at
**<https://manuel-antunes.github.io/nestjs-inngest-transport/>**.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The test suite has four levels — unit, integration (a real
Nest application on both adapters), end-to-end (the real Inngest dev server in Docker) and package
(the packed tarball loaded from CommonJS and ESM).

## License

[MIT](./LICENSE) © Manuel Antunes
