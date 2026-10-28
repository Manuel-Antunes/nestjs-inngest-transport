import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Inngest } from 'inngest';

import type { InngestHttpPlatform, InngestStrategyOptions } from '../../src';
import { InngestStrategy } from '../../src';
import { Deliveries, OrdersModule } from './orders.handler';

export interface OrdersAppOptions {
  readonly platform: InngestHttpPlatform;
  readonly appId?: string;
  readonly baseUrl?: string;
  readonly strategy?: Partial<InngestStrategyOptions>;
  readonly beforeStart?: (app: INestApplication) => void;
}

/**
 * The application a test talks to: an HTTP host on Express or Fastify, with the orders handlers
 * connected as an Inngest microservice — the documented boot order, `startAllMicroservices()`
 * before `init()`.
 */
export class OrdersApp {
  private constructor(
    readonly app: INestApplication,
    readonly inngest: Inngest.Any,
    readonly strategy: InngestStrategy,
  ) {}

  static async create(options: OrdersAppOptions): Promise<OrdersApp> {
    const inngest = new Inngest({
      id: options.appId ?? 'orders',
      isDev: true,
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      logger: OrdersApp.quietLogger(),
    });
    const app = await NestFactory.create(
      OrdersModule,
      options.platform === 'fastify'
        ? new FastifyAdapter()
        : new ExpressAdapter(),
      { logger: false },
    );
    const strategy = new InngestStrategy({
      inngest,
      httpAdapter: app.getHttpAdapter(),
      ...options.strategy,
    });
    app.connectMicroservice<MicroserviceOptions>({ strategy });
    options.beforeStart?.(app);
    await app.startAllMicroservices();
    await app.init();
    if (options.platform === 'fastify') {
      await app.getHttpAdapter().getInstance().ready();
    }
    return new OrdersApp(app, inngest, strategy);
  }

  get deliveries(): Deliveries {
    return this.app.get(Deliveries);
  }

  async listen(port = 0): Promise<number> {
    await this.app.listen(port, '0.0.0.0');
    const address = this.app.getHttpServer().address() as { port: number };
    return address.port;
  }

  async close(): Promise<void> {
    await this.app.close();
  }

  private static quietLogger() {
    const logger = new Logger('inngest');
    return {
      info: () => undefined,
      debug: () => undefined,
      warn: (...args: unknown[]) => logger.warn(args.join(' ')),
      error: (...args: unknown[]) => logger.error(args.join(' ')),
    };
  }
}
