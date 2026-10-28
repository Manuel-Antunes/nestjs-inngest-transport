import type { IncomingMessage, ServerResponse } from 'node:http';

import type { HttpServer } from '@nestjs/common';
import type { Inngest, InngestFunction } from 'inngest';
import { serve as expressServe } from 'inngest/express';
import { fastifyPlugin } from 'inngest/fastify';

/** The HTTP platforms the functions can be served from: Nest's two official adapters. */
export type InngestHttpPlatform = 'express' | 'fastify';

/** What is served, and where. */
export interface InngestServeOptions {
  readonly inngest: Inngest.Any;
  readonly functions: readonly InngestFunction.Any[];
  /** The path the functions are served at. */
  readonly servePath: string;
  /** The origin this service is reachable at, when it is not the one a registration arrives on. */
  readonly serveOrigin?: string;
}

interface FastifyLike {
  register(plugin: unknown, options: unknown): unknown;
  server?: { listening?: boolean };
}

interface ExpressLike {
  use(path: string, handler: ExpressHandler): unknown;
}

type ExpressRequest = IncomingMessage & { body?: unknown };
type ExpressHandler = (
  request: ExpressRequest,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => unknown;

/**
 * **Mounting the functions on the host application's HTTP server.**
 *
 * Inngest invokes a function over HTTP, so a service that receives has to be reachable. This mounts
 * Inngest's own handler (`inngest/express` or `inngest/fastify`) on the host application's adapter
 * and returns; the host owns the port and the lifecycle.
 *
 * It has to happen **before the application is initialized** — `startAllMicroservices()` before
 * `app.init()` or `app.listen()`: Fastify refuses a plugin once it has booted, and Express would put
 * the route behind Nest's not-found handler, where no request reaches it.
 */
export class InngestServe {
  /**
   * @param httpAdapter The host application's adapter.
   * @param options What to serve.
   * @returns The platform the functions were mounted on.
   * @throws When there is no adapter, it is neither Express nor Fastify, or it is already listening.
   */
  static mount(
    httpAdapter: HttpServer | undefined,
    options: InngestServeOptions,
  ): InngestHttpPlatform {
    if (!httpAdapter) {
      throw new Error(
        'InngestStrategy needs a Nest HTTP adapter: Inngest reaches a service by calling it. Pass ' +
          '`httpAdapter: app.getHttpAdapter()` in the options, or call `setHttpAdapter(...)` before ' +
          '`startAllMicroservices()`.',
      );
    }

    const platform = InngestServe.platformOf(httpAdapter);
    InngestServe.refuseWhenListening(httpAdapter);

    if (platform === 'fastify') {
      (httpAdapter.getInstance() as FastifyLike).register(fastifyPlugin, {
        client: options.inngest,
        functions: [...options.functions],
        options: InngestServe.registerOptionsOf(options),
      });
    } else {
      const handler = expressServe({
        client: options.inngest,
        functions: [...options.functions],
        ...InngestServe.registerOptionsOf(options),
      }) as ExpressHandler;
      (httpAdapter.getInstance() as ExpressLike).use(
        options.servePath,
        InngestServe.withJsonBody(handler),
      );
    }
    return platform;
  }

  /**
   * Which adapter the host runs on: what `getType()` answers, and the instance's shape for an
   * adapter that does not say.
   *
   * @throws When it is neither.
   */
  static platformOf(httpAdapter: HttpServer): InngestHttpPlatform {
    const type = httpAdapter.getType?.();
    if (type === 'express' || type === 'fastify') {
      return type;
    }
    const instance = httpAdapter.getInstance?.() as
      | Partial<FastifyLike & ExpressLike>
      | undefined;
    if (typeof instance?.register === 'function') {
      return 'fastify';
    }
    if (typeof instance?.use === 'function') {
      return 'express';
    }
    throw new Error(
      `InngestStrategy serves through Express or Fastify, and the host application's adapter is ` +
        `${type ? `'${type}'` : 'neither'}: create it with \`new ExpressAdapter()\` or \`new FastifyAdapter()\`.`,
    );
  }

  private static refuseWhenListening(httpAdapter: HttpServer): void {
    const server = httpAdapter.getHttpServer?.() as
      | { listening?: boolean }
      | undefined;
    if (server?.listening) {
      throw new Error(
        'InngestStrategy has to be started before the application listens: call ' +
          '`await app.startAllMicroservices()` before `await app.listen(...)`, or the functions are ' +
          'mounted where no request reaches them.',
      );
    }
  }

  private static registerOptionsOf(options: InngestServeOptions): {
    servePath: string;
    serveOrigin?: string;
  } {
    return {
      servePath: options.servePath,
      ...(options.serveOrigin ? { serveOrigin: options.serveOrigin } : {}),
    };
  }

  /**
   * Express hands `inngest/express` whatever body parser ran before it, and Nest registers its JSON
   * parser when the application initializes — after the strategy was mounted. So the body is read
   * here when nothing has read it yet.
   */
  private static withJsonBody(handler: ExpressHandler): ExpressHandler {
    return async (request, response, next) => {
      if (request.body === undefined && InngestServe.carriesBody(request)) {
        try {
          request.body = await InngestServe.readJson(request);
        } catch (failure) {
          next(failure);
          return;
        }
      }
      return handler(request, response, next);
    };
  }

  private static carriesBody(request: IncomingMessage): boolean {
    return request.method !== 'GET' && request.method !== 'HEAD';
  }

  private static async readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return text.length === 0 ? undefined : JSON.parse(text);
  }
}
