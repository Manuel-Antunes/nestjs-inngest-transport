import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Inngest } from 'inngest';
import request from 'supertest';

import { InngestStrategy } from '../../src';
import { OrdersModule } from '../support/orders.handler';
import { OrdersApp } from '../support/orders-app';

const ordersFunctions = 6;

describe.each(['express', 'fastify'] as const)('serving on %s', (platform) => {
  it('serves every function at /api/inngest, beside the application’s own routes', async () => {
    const orders = await OrdersApp.create({ platform });
    try {
      const response = await request(orders.app.getHttpServer())
        .get('/api/inngest')
        .expect(200);

      expect(response.body).toMatchObject({
        function_count: ordersFunctions,
        mode: 'dev',
      });
      expect(orders.strategy.unwrap()).toMatchObject({ platform });
      await request(orders.app.getHttpServer())
        .get('/nothing-here')
        .expect(404);
    } finally {
      await orders.close();
    }
  });

  it('serves at the path it is told', async () => {
    const orders = await OrdersApp.create({
      platform,
      strategy: { servePath: '/hooks/inngest' },
    });
    try {
      await request(orders.app.getHttpServer())
        .get('/hooks/inngest')
        .expect(200);
    } finally {
      await orders.close();
    }
  });

  it('answers an invocation it cannot verify with an error, not a crash', async () => {
    const orders = await OrdersApp.create({ platform });
    try {
      const response = await request(orders.app.getHttpServer())
        .post('/api/inngest?fnId=orders-unknown&stepId=step')
        .set('content-type', 'application/json')
        .send({ event: { name: 'x', data: {} } });

      expect(response.status).toBeGreaterThanOrEqual(400);
      await request(orders.app.getHttpServer()).get('/api/inngest').expect(200);
    } finally {
      await orders.close();
    }
  });

  it('refuses to start once the application is listening, instead of serving nothing', async () => {
    const app = await NestFactory.create(
      OrdersModule,
      platform === 'fastify' ? new FastifyAdapter() : new ExpressAdapter(),
      { logger: false },
    );
    try {
      await app.listen(0, '127.0.0.1');
      app.connectMicroservice<MicroserviceOptions>({
        strategy: new InngestStrategy({
          inngest: new Inngest({ id: 'late', isDev: true }),
          httpAdapter: app.getHttpAdapter(),
        }),
      });

      await expect(app.startAllMicroservices()).rejects.toThrow(
        /before the application listens/,
      );
    } finally {
      await app.close();
    }
  });

  it('after init(): unreachable on Express, behind the not-found handler; still served on Fastify, which boots at listen()', async () => {
    const app = await NestFactory.create(
      OrdersModule,
      platform === 'fastify' ? new FastifyAdapter() : new ExpressAdapter(),
      { logger: false },
    );
    try {
      await app.init();
      app.connectMicroservice<MicroserviceOptions>({
        strategy: new InngestStrategy({
          inngest: new Inngest({ id: 'late', isDev: true }),
          httpAdapter: app.getHttpAdapter(),
        }),
      });
      await app.startAllMicroservices();
      if (platform === 'fastify') {
        await app.getHttpAdapter().getInstance().ready();
      }

      await request(app.getHttpServer())
        .get('/api/inngest')
        .expect(platform === 'express' ? 404 : 200);
    } finally {
      await app.close();
    }
  });
});
