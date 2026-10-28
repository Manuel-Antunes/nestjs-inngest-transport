# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-28

First public release.

### Added

- `InngestStrategy`: every `@EventPattern` becomes an Inngest function, mounted on the host
  application's **Express or Fastify** adapter (detected from the adapter) at `/api/inngest`.
- `InngestClientProxy`: `emit()` sends an Inngest event; works with `ClientsModule` through
  `customClass`.
- `InngestRecordBuilder`: idempotency key, timestamp, sessions and `user` entries per send.
- `InngestContext`: the event, its name, the step tools, the run id, the attempt and the batch.
- `@InngestEventPattern(pattern, config?)`: `@EventPattern` bound to this transport, with the
  function's configuration type-checked; `INNGEST_TRANSPORT`, the transport id.
- Function configuration for every function (`functionConfig`, `retries`) and per pattern — the
  decorator's `config`, or `@EventPattern(pattern, { inngest: { … } })`.
- `InngestExceptionFilter`: lets `NonRetriableError`, `RetryAfterError` and every other error reach
  Inngest as itself instead of Nest's generic `Internal server error`.
- `InngestTriggers`: literal and `.*` routing-key patterns out of the box, custom resolvers for
  wildcard namespaces, and one-run-per-event claiming across overlapping patterns.
- `nestjs-inngest-transport/testing`: `FakeInngest`.
- Refuses to start once the application is listening, where the functions would be unreachable.

[Unreleased]: https://github.com/Manuel-Antunes/nestjs-inngest-transport/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Manuel-Antunes/nestjs-inngest-transport/releases/tag/v0.1.0
