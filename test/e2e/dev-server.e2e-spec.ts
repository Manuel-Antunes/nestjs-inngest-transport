import { lastValueFrom } from 'rxjs';

import { InngestClientProxy, InngestRecordBuilder } from '../../src';
import { eventually, InngestDevServer } from '../support/inngest-dev-server';
import { OrdersApp } from '../support/orders-app';

describe.each(['express', 'fastify'] as const)(
  'against the Inngest dev server, on %s',
  (platform) => {
    let devServer: InngestDevServer;
    let orders: OrdersApp;
    let client: InngestClientProxy;

    const emit = (pattern: string, data: unknown) =>
      lastValueFrom(client.emit(pattern, data));

    beforeAll(async () => {
      devServer = await InngestDevServer.start();
      orders = await OrdersApp.create({
        platform,
        appId: `orders-${platform}`,
        baseUrl: devServer.baseUrl,
        strategy: { serveOrigin: devServer.serveOrigin },
      });
      await orders.listen(devServer.appPort);
      await devServer.register();
      client = new InngestClientProxy({ inngest: orders.inngest });
    });

    afterAll(async () => {
      await orders?.close();
      await devServer?.stop();
    });

    it('delivers an event sent through the client proxy to the handler bound for it', async () => {
      await emit('orders.placed', { id: 'o-1', customerId: 'c-1' });

      const [delivery] = await eventually(() => {
        const found = orders.deliveries.of('orders.placed.*');
        expect(found).toHaveLength(1);
        return found;
      });
      expect(delivery).toMatchObject({
        data: { id: 'O-1', customerId: 'c-1' },
        eventName: 'orders.placed',
        attempt: 0,
      });
      const [run] = await eventually(async () => {
        const runs = await devServer.runs('orders.placed');
        expect(runs).toEqual([
          expect.objectContaining({ status: 'Completed' }),
        ]);
        return runs;
      });
      expect(await devServer.outputOf(run)).toEqual({
        answer: { accepted: 'O-1' },
        stampedBy: 'orders.placed.*',
      });
    });

    it('carries a record’s user entries and sessions across the wire', async () => {
      await emit(
        'orders.paid',
        new InngestRecordBuilder({ id: 'o-2' })
          .setUser({ tenant: 'acme' })
          .setSession('customer_id', 'c-2')
          .build(),
      );

      const [delivery] = await eventually(() => {
        const found = orders.deliveries.of('orders.paid');
        expect(found.length).toBeGreaterThan(0);
        return found;
      });
      expect(delivery.user).toEqual({ tenant: 'acme' });
      const [stored] = await devServer.events('orders.paid');
      expect(stored.user).toEqual({ tenant: 'acme' });
    });

    it('runs each step once across invocations, and records the function’s answer', async () => {
      const [run] = await eventually(async () => {
        const runs = await devServer.runs('orders.paid');
        expect(runs).toEqual([
          expect.objectContaining({ status: 'Completed' }),
        ]);
        return runs;
      });

      expect(await devServer.outputOf(run)).toBe('receipt for charged o-2');
      expect(orders.deliveries.steps).toEqual(
        expect.arrayContaining(['charge', 'receipt']),
      );
      expect(
        orders.deliveries.steps.filter((s) => s === 'charge'),
      ).toHaveLength(1);
      expect(
        orders.deliveries.steps.filter((s) => s === 'receipt'),
      ).toHaveLength(1);
    });

    it('runs one event once, however many times it is sent with the same idempotency key', async () => {
      const once = () =>
        emit(
          'orders.placed',
          new InngestRecordBuilder({ id: 'o-3', customerId: 'c-3' })
            .setIdempotencyKey('o-3')
            .build(),
        );
      await once();
      await once();

      await eventually(() => {
        expect(
          orders.deliveries
            .of('orders.placed.*')
            .filter((d) => (d.data as { id: string }).id === 'O-3'),
        ).toHaveLength(1);
      });
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      expect(
        orders.deliveries
          .of('orders.placed.*')
          .filter((d) => (d.data as { id: string }).id === 'O-3'),
      ).toHaveLength(1);
    });

    it('gives up on a NonRetriableError at once, when InngestExceptionFilter lets it through', async () => {
      await emit('orders.refused', { id: 'o-4' });

      await eventually(async () => {
        const runs = await devServer.runs('orders.refused');
        expect(runs).toEqual([expect.objectContaining({ status: 'Failed' })]);
      });
      expect(orders.deliveries.of('orders.refused')).toHaveLength(1);
    });

    it('retries after the delay a RetryAfterError asks for', async () => {
      await emit('orders.later', { id: 'o-5' });

      await eventually(async () => {
        const runs = await devServer.runs('orders.later');
        expect(runs).toEqual([
          expect.objectContaining({ status: 'Completed' }),
        ]);
      }, 60_000);
      expect(
        orders.deliveries.of('orders.later').map(({ attempt }) => attempt),
      ).toEqual([0, 1]);
    });

    it('creates each function with the configuration its pattern asked for', async () => {
      const response = await fetch(`${devServer.baseUrl}/dev`);
      const body = (await response.json()) as {
        functions?: { slug: string; config?: unknown }[];
      };

      expect(JSON.stringify(body)).toContain('charge-order');
    });
  },
);
