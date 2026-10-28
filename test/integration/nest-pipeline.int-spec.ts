import { OrdersApp } from '../support/orders-app';
import { runFunction } from '../support/run-function';

describe.each(['express', 'fastify'] as const)(
  'a run through the Nest pipeline, on %s',
  (platform) => {
    let orders: OrdersApp;

    beforeAll(async () => {
      orders = await OrdersApp.create({ platform });
    });

    afterAll(() => orders.close());

    beforeEach(() => orders.deliveries.reset());

    it('reaches the handler through its guard, pipe and interceptor', async () => {
      const { result, error } = await runFunction(
        orders.strategy,
        'orders.placed.*',
        { name: 'orders.placed', data: { id: 'o-1', customerId: 'c-1' } },
      );

      expect(error).toBeUndefined();
      expect(result).toEqual({
        answer: { accepted: 'O-1' },
        stampedBy: 'orders.placed.*',
      });
      expect(orders.deliveries.of('orders.placed.*')).toEqual([
        expect.objectContaining({
          data: { id: 'O-1', customerId: 'c-1' },
          eventName: 'orders.placed',
          attempt: 0,
        }),
      ]);
    });

    it('fails the run when a guard refuses it', async () => {
      const { error } = await runFunction(orders.strategy, 'orders.placed.*', {
        name: 'orders.placed',
        data: { id: 'o-1', customerId: 'blocked' },
      });

      expect(error).toMatchObject({ message: 'Forbidden resource' });
      expect(orders.deliveries.received).toEqual([]);
    });

    it('memoizes steps: a step that ran is not run again on the next invocation', async () => {
      const { result } = await runFunction(orders.strategy, 'orders.paid', {
        name: 'orders.paid',
        data: { id: 'o-2' },
      });

      expect(result).toBe('receipt for charged o-2');
      expect(orders.deliveries.steps.filter((s) => s === 'receipt')).toEqual([
        'receipt',
      ]);
    });

    it('hands the event to the handler as Inngest delivered it, user entries included', async () => {
      await runFunction(orders.strategy, 'orders.paid', {
        name: 'orders.paid',
        data: { id: 'o-3' },
        user: { tenant: 'acme' },
      });

      expect(orders.deliveries.of('orders.paid')[0]).toMatchObject({
        user: { tenant: 'acme' },
      });
    });

    it('creates each function with the configuration its decorator asked for', () => {
      const { functions } = orders.strategy.unwrap();

      expect(functions.get('orders.paid')?.opts).toMatchObject({
        id: 'charge-order',
        retries: 2,
        concurrency: { limit: 1 },
      });
      expect(functions.get('orders.later')?.opts).toMatchObject({
        id: 'orders-later',
        retries: 3,
      });
    });

    describe('errors', () => {
      it('reaches Inngest as a generic error under Nest’s default filter — the reason InngestExceptionFilter exists', async () => {
        const { error } = await runFunction(
          orders.strategy,
          'orders.unfiltered-refusal',
          { name: 'orders.unfiltered-refusal', data: {} },
        );

        expect(error).toMatchObject({
          name: 'Error',
          message: 'Internal server error',
        });
      });

      it('reaches Inngest as itself under InngestExceptionFilter: a NonRetriableError stays one', async () => {
        const { error } = await runFunction(orders.strategy, 'orders.refused', {
          name: 'orders.refused',
          data: {},
        });

        expect(error).toMatchObject({
          name: 'NonRetriableError',
          message: 'this order can never be shipped',
        });
      });

      it('reaches Inngest as itself under InngestExceptionFilter: a RetryAfterError stays one', async () => {
        const { error } = await runFunction(orders.strategy, 'orders.later', {
          name: 'orders.later',
          data: {},
        });

        expect(error).toMatchObject({
          name: 'RetryAfterError',
          message: 'the warehouse is closed',
        });
      });
    });
  },
);
