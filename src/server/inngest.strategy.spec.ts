import type { MessageHandler } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';

import { FakeInngest } from '../testing/fake-inngest';
import type { InngestContext } from './inngest.context';
import { InngestEventsMap, InngestStatus } from './inngest.events';
import { InngestStrategy } from './inngest.strategy';

const handlerOf = (
  implementation: (data: unknown, context: InngestContext) => unknown,
): MessageHandler => implementation as unknown as MessageHandler;

const strategyOver = (inngest = new FakeInngest()) =>
  new InngestStrategy({ inngest: inngest.asClient() });

const fastifyAdapter = (register = vi.fn()) => ({
  getType: () => 'fastify',
  getInstance: () => ({ register }),
  getHttpServer: () => ({ listening: false }),
});

const event = {
  name: 'orders.placed',
  id: 'e-1',
  data: { orderId: 'o-1' },
};

const run = (strategy: InngestStrategy, pattern = 'orders.placed') =>
  strategy.handleMessage(pattern, event as never, 'step' as never, 'r-1', 3);

describe('InngestStrategy', () => {
  it('serves at the default path unless told another', () => {
    expect(InngestStrategy.DEFAULT_SERVE_PATH).toBe('/api/inngest');
  });

  it('refuses to be built without a client', () => {
    expect(() => new InngestStrategy({ inngest: undefined as never })).toThrow(
      /needs an inngest client/,
    );
  });

  describe('handling a run', () => {
    it('gives the handler the data and a context that says where the run is', async () => {
      const strategy = strategyOver();
      let seen: InngestContext | undefined;
      strategy.addHandler(
        'orders.placed',
        handlerOf((data, context) => {
          seen = context;
          return data;
        }),
        true,
      );

      const answer = await run(strategy);

      expect(answer).toEqual({ orderId: 'o-1' });
      expect(seen?.getPattern()).toBe('orders.placed');
      expect(seen?.getEventName()).toBe('orders.placed');
      expect(seen?.getRunId()).toBe('r-1');
      expect(seen?.getAttempt()).toBe(3);
      expect(seen?.getEventId()).toBe('e-1');
      expect(seen?.getStep()).toBe('step');
      expect(seen?.getEvents()).toEqual([event]);
    });

    it('answers what an observable handler emitted last', async () => {
      const strategy = strategyOver();
      strategy.addHandler(
        'orders.placed',
        handlerOf(() => of(1, 2, 3)),
        true,
      );

      await expect(run(strategy)).resolves.toBe(3);
    });

    it('fails the run with the very error the handler threw, so Inngest retries it', async () => {
      const strategy = strategyOver();
      const failure = new Error('boom');
      strategy.addHandler(
        'orders.placed',
        handlerOf(() => {
          throw failure;
        }),
        true,
      );

      await expect(run(strategy)).rejects.toBe(failure);
    });

    it('turns what an exception filter answered into an Error Inngest can show', async () => {
      const strategy = strategyOver();
      const answered = { status: 'error', message: 'Internal server error' };
      strategy.addHandler(
        'orders.placed',
        handlerOf(() => throwError(() => answered)),
        true,
      );

      const failure = await run(strategy).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).toMatchObject({
        message: 'Internal server error',
        cause: answered,
      });
    });

    it('acknowledges a run nobody is bound for', async () => {
      await expect(run(strategyOver(), 'orders.unknown')).resolves.toBe(
        undefined,
      );
    });

    it('deserializes the event with the pattern as the channel', async () => {
      const deserialize = vi.fn().mockReturnValue({ data: 'custom' });
      const strategy = new InngestStrategy({
        inngest: new FakeInngest().asClient(),
        deserializer: { deserialize },
      });
      strategy.addHandler(
        'orders.placed',
        handlerOf((data) => data),
        true,
      );

      await expect(run(strategy)).resolves.toBe('custom');
      expect(deserialize).toHaveBeenCalledWith(event, {
        channel: 'orders.placed',
      });
    });
  });

  describe('listening', () => {
    it('reports a missing HTTP adapter to the listeners and to the callback', async () => {
      const strategy = strategyOver();
      strategy.addHandler(
        'orders.placed',
        handlerOf(() => undefined),
        true,
      );
      const errors: Error[] = [];
      strategy.on(InngestEventsMap.ERROR, (error) => errors.push(error));
      const callback = vi.fn();

      await strategy.listen(callback);

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/needs a Nest HTTP adapter/);
      expect(callback).toHaveBeenCalledWith(errors[0]);
    });

    it('refuses a host that is neither Express nor Fastify', async () => {
      const strategy = strategyOver();
      strategy.setHttpAdapter({
        getType: () => 'koa',
        getInstance: () => ({}),
      } as never);
      const callback = vi.fn();

      await strategy.listen(callback);

      expect(callback.mock.calls[0][0].message).toMatch(
        /adapter is 'koa'.*ExpressAdapter.*FastifyAdapter/,
      );
    });

    it('creates the functions, with their pattern extras, and mounts them on the host', async () => {
      const inngest = new FakeInngest();
      const strategy = strategyOver(inngest);
      strategy.addHandler(
        'orders.placed',
        handlerOf(() => undefined),
        true,
        { inngest: { retries: 1 } },
      );
      const register = vi.fn();
      strategy.setHttpAdapter(fastifyAdapter(register) as never);
      const listening = vi.fn();
      strategy.on(InngestEventsMap.LISTENING, listening);
      const callback = vi.fn();

      await strategy.listen(callback);

      expect(callback).toHaveBeenCalledWith();
      expect(listening).toHaveBeenCalledOnce();
      expect(inngest.created).toHaveLength(1);
      expect(inngest.created[0].config).toMatchObject({ retries: 1 });
      expect(register).toHaveBeenCalledOnce();
      expect(register.mock.calls[0][1]).toMatchObject({
        options: { servePath: '/api/inngest' },
      });
      expect(strategy.unwrap()).toMatchObject({
        platform: 'fastify',
        triggers: new Map([['orders.placed', ['orders.placed']]]),
      });
    });

    it('creates the functions once however many times it listens', async () => {
      const inngest = new FakeInngest();
      const strategy = strategyOver(inngest);
      strategy.addHandler(
        'orders.placed',
        handlerOf(() => undefined),
        true,
      );
      strategy.setHttpAdapter(fastifyAdapter() as never);

      await strategy.listen(() => undefined);
      await strategy.listen(() => undefined);

      expect(
        strategy.unwrap<{ functions: Map<string, unknown> }>().functions.size,
      ).toBe(1);
    });

    it('lets go of what it served when closed', async () => {
      const strategy = strategyOver();
      const closed = vi.fn();
      strategy.on(InngestEventsMap.CLOSE, closed);
      const statuses: InngestStatus[] = [];
      strategy.status.subscribe((status) => statuses.push(status));

      await strategy.close();

      expect(closed).toHaveBeenCalledOnce();
      expect(statuses).toContain(InngestStatus.DISCONNECTED);
      expect(strategy.unwrap()).toMatchObject({ platform: undefined });
    });
  });
});
