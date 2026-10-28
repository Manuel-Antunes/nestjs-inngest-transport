import type { HttpServer } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type {
  ConsumerDeserializer,
  ConsumerSerializer,
  CustomTransportStrategy,
  TransportId,
} from '@nestjs/microservices';
import { Server } from '@nestjs/microservices';
import type { EventPayload, Inngest, InngestFunction } from 'inngest';

import type { InngestTriggerResolver } from '../shared/inngest-triggers';
import type { InngestStepTools } from './inngest.context';
import { InngestContext } from './inngest.context';
import type { InngestEvents } from './inngest.events';
import { InngestEventsMap, InngestStatus } from './inngest.events';
import { INNGEST_TRANSPORT } from './inngest.transport';
import type {
  InngestFunctionConfig,
  InngestPatternExtras,
} from './inngest-functions';
import { InngestFunctions } from './inngest-functions';
import { InngestListeners } from './inngest-listeners';
import type { InngestHttpPlatform } from './inngest-serve';
import { InngestServe } from './inngest-serve';

export interface InngestStrategyOptions {
  /** The Inngest client the functions are created on — the same one the client proxy sends through. */
  readonly inngest: Inngest.Any;
  /**
   * The Nest HTTP adapter the functions are served from: `app.getHttpAdapter()`, Express or
   * Fastify. Inngest reaches a service by **calling** it, so there has to be something to call. It
   * can also be set later with {@link InngestStrategy.setHttpAdapter}, before
   * `startAllMicroservices()`. The strategy never opens a port of its own — the host application
   * owns it.
   */
  readonly httpAdapter?: HttpServer;
  /** Where the functions are served. @default '/api/inngest' */
  readonly servePath?: string;
  /**
   * **The origin this service is reachable at**, when it is not the one the registration request
   * arrived on. The SDK otherwise derives what it registers from that request's `Host` — so a
   * registration made from outside the service's network registers an address that only exists
   * outside it, Inngest calls something that is not this service, and every run hangs in
   * `Running` with nothing in any log. Behind a proxy, in Docker or in Kubernetes, set it.
   *
   * ```ts
   * new InngestStrategy({ inngest, serveOrigin: 'http://orders:3000' })
   * ```
   */
  readonly serveOrigin?: string;
  /**
   * **What a pattern stands for, as event names** — see {@link InngestTriggerResolver}. Left out,
   * {@link InngestTriggers.literal}: a literal name, or one with a trailing `.*`.
   */
  readonly triggers?: InngestTriggerResolver;
  /**
   * How many times Inngest retries a failed run — every function's `retries`. Left out, Inngest's
   * default (4). A single function's `@EventPattern` extras override it.
   */
  readonly retries?: number;
  /**
   * **Every function's configuration** — concurrency, throttling, timeouts, … — or a function of the
   * pattern that answers it. A single function's `@EventPattern(pattern, { inngest: { … } })` is
   * merged over it.
   */
  readonly functionConfig?:
    | InngestFunctionConfig
    | ((pattern: string) => InngestFunctionConfig | undefined);
  /**
   * **How an Inngest event becomes a packet.** It is handed the event and `{ channel }`, the pattern
   * the function was bound for. Left out, Nest's own `IncomingRequestDeserializer` applies and a
   * handler's `@Payload()` is the event's `data`.
   */
  readonly deserializer?: ConsumerDeserializer;
  /**
   * What a handler's **answer** is serialized with. A run's return value is recorded by Inngest as
   * the run's output. Left out, Nest's own `IdentitySerializer` applies.
   */
  readonly serializer?: ConsumerSerializer;
}

/**
 * **The receiving half on Inngest: a function is the binding, and an invocation is the delivery.**
 *
 * From the controller's side it is any Nest transport: an `@EventPattern` is a binding,
 * `@Payload()` is the event's data, `@Ctx()` is the {@link InngestContext}, and guards,
 * interceptors, pipes and filters apply.
 *
 * ```ts
 * const app = await NestFactory.create(AppModule);
 * app.connectMicroservice({
 *   strategy: new InngestStrategy({ inngest, httpAdapter: app.getHttpAdapter() }),
 * });
 * await app.startAllMicroservices();
 * await app.listen(3000);
 * ```
 *
 * ## The binding is resolved at boot
 * A broker matches a routing key against its patterns when a message arrives; an Inngest function
 * **declares** the exact event names that trigger it. So each pattern is turned into names through
 * the `triggers` resolver when the functions are created, and each name is claimed by the most
 * specific pattern that asked for it ({@link InngestTriggers.claim}), so one event is one run.
 *
 * ## It mounts, and does not listen
 * Inngest invokes a function over HTTP, so a service that receives has to be reachable. This mounts
 * Inngest's serve handler on the host application's Express or Fastify instance and returns; the
 * host owns the port and the lifecycle, which is why it must be started before the host listens.
 */
export class InngestStrategy
  extends Server<InngestEvents, InngestStatus>
  implements CustomTransportStrategy
{
  /** Where the functions are served when {@link InngestStrategyOptions.servePath} is left out. */
  static readonly DEFAULT_SERVE_PATH = '/api/inngest';

  override transportId: TransportId = INNGEST_TRANSPORT;

  protected override readonly logger = new Logger(InngestStrategy.name);

  private readonly inngest: Inngest.Any;
  private readonly servePath: string;
  private readonly serveOrigin?: string;
  private readonly functions: InngestFunctions;
  private readonly listeners = new InngestListeners();

  private httpAdapter?: HttpServer;
  private platform?: InngestHttpPlatform;

  /** @param options The Inngest client, how patterns become functions, and where they are served. */
  constructor(protected readonly options: InngestStrategyOptions) {
    super();
    this.inngest = options.inngest;
    if (!this.inngest) {
      throw new Error(
        'InngestStrategy needs an inngest client: it is what the functions are created on.',
      );
    }
    this.servePath = options.servePath ?? InngestStrategy.DEFAULT_SERVE_PATH;
    this.serveOrigin = options.serveOrigin;
    this.httpAdapter = options.httpAdapter;
    this.functions = new InngestFunctions(
      options,
      (pattern, event, step, runId, attempt, events) =>
        this.handleMessage(pattern, event, step, runId, attempt, events),
      this.logger,
      (pattern) =>
        (this.getHandlerByPattern(pattern)?.extras as InngestPatternExtras)
          ?.inngest,
    );
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /** For a host that builds the strategy before it has an adapter to give it. */
  setHttpAdapter(adapter: HttpServer): void {
    this.httpAdapter = adapter;
  }

  /**
   * Creates one function per bound pattern and mounts them on the host. A failure is reported to the
   * `error` listeners and to `callback`, and leaves the strategy disconnected.
   */
  async listen(
    callback: (...optionalParams: unknown[]) => void,
  ): Promise<void> {
    this._status$.next(InngestStatus.STARTING);
    try {
      this.functions.clear();
      this.functions.create([...this.getHandlers().keys()]);
      this.platform = InngestServe.mount(this.httpAdapter, {
        inngest: this.inngest,
        functions: this.functions.all(),
        servePath: this.servePath,
        serveOrigin: this.serveOrigin,
      });
      this._status$.next(InngestStatus.CONNECTED);
      this.listeners.emit(InngestEventsMap.LISTENING);
      this.logger.log(
        `${this.functions.size} function(s) served at ${this.servePath} on ${this.platform}` +
          (this.functions.size > 0 ? ` (${this.functions.summary()})` : ''),
      );
      callback();
    } catch (failure) {
      this._status$.next(InngestStatus.DISCONNECTED);
      this.listeners.emit(InngestEventsMap.ERROR, failure as Error);
      callback(failure);
    }
  }

  /** Forgets the functions; the host owns the port, so nothing is closed. */
  async close(): Promise<void> {
    this.functions.clear();
    this.platform = undefined;
    this._status$.next(InngestStatus.DISCONNECTED);
    this.listeners.emit(InngestEventsMap.CLOSE);
  }

  /**
   * The Inngest client, the platform the functions were mounted on, the functions by pattern and the
   * event names each was given.
   */
  override unwrap<T = InngestStrategyInternals>(): T {
    return {
      inngest: this.inngest,
      platform: this.platform,
      functions: this.functions.byBinding(),
      triggers: this.functions.triggers(),
    } satisfies InngestStrategyInternals as T;
  }

  /** Registers a listener for `error`, `listening` or `close`; see {@link InngestEventsMap}. */
  on<
    EventKey extends keyof InngestEvents = keyof InngestEvents,
    EventCallback extends InngestEvents[EventKey] = InngestEvents[EventKey],
  >(event: EventKey, callback: EventCallback): void {
    this.listeners.add(event, callback);
  }

  /**
   * One invocation, from the event Inngest brings to the handler that was bound for it. The bound
   * pattern is passed rather than the event's name, because the pattern is what the controller
   * declared and the name is only one of the things it stands for.
   *
   * The run's output is the handler's answer — the last value, when it answers an observable. A
   * handler that throws (or whose observable errors) fails the run, and Inngest retries it.
   */
  async handleMessage(
    pattern: string,
    event: EventPayload,
    step: InngestStepTools,
    runId: string,
    attempt: number,
    events?: EventPayload[],
  ): Promise<unknown> {
    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      this.logger.warn(
        `no handler for '${pattern}' — the run is acknowledged and dropped`,
      );
      return undefined;
    }

    const message = await this.deserializer.deserialize(event, {
      channel: pattern,
    });
    const context = new InngestContext([
      event,
      pattern,
      step,
      runId,
      attempt,
      events,
    ]);

    return this.onProcessingStartHook(this.transportId, context, async () => {
      const response$ = this.transformToObservable(
        await handler(message.data, context),
      );

      return new Promise((resolve, reject) => {
        let answer: unknown;
        let failed = false;
        this.send(response$, (packet) => {
          if (packet.err !== undefined && packet.err !== null) {
            failed = true;
            reject(InngestStrategy.asError(packet.err));
          } else if ('response' in packet) {
            answer = packet.response;
          }
          if (packet.isDisposed) {
            this.onProcessingEndHook?.(this.transportId, context);
            if (!failed) {
              resolve(this.serializer.serialize(answer as never));
            }
          }
        });
      });
    });
  }

  /**
   * Nest's default exception filter answers a plain `{ status, message }`; Inngest records an Error
   * best, so anything else is wrapped, with what was thrown as its `cause`.
   */
  private static asError(failure: unknown): unknown {
    if (failure instanceof Error) {
      return failure;
    }
    const message =
      typeof failure === 'object' && failure !== null && 'message' in failure
        ? String((failure as { message: unknown }).message)
        : String(failure);
    return new Error(message, { cause: failure });
  }
}

/** What {@link InngestStrategy.unwrap} answers. */
export interface InngestStrategyInternals {
  readonly inngest: Inngest.Any;
  readonly platform?: InngestHttpPlatform;
  readonly functions: ReadonlyMap<string, InngestFunction.Any>;
  readonly triggers: ReadonlyMap<string, readonly string[]>;
}
