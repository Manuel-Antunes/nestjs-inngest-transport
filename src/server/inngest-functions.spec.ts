import { Logger } from '@nestjs/common';

import { InngestTriggers } from '../shared/inngest-triggers';
import { FakeInngest } from '../testing/fake-inngest';
import type { InngestFunctionsOptions } from './inngest-functions';
import { InngestFunctions } from './inngest-functions';

const functionsOver = (
  inngest: FakeInngest,
  options: Omit<InngestFunctionsOptions, 'inngest'> = {},
  extras: Record<string, object> = {},
) => {
  const run = vi.fn().mockResolvedValue('ran');
  return {
    run,
    functions: new InngestFunctions(
      { inngest: inngest.asClient(), ...options },
      run,
      new Logger('spec'),
      (pattern) => extras[pattern],
    ),
  };
};

describe('InngestFunctions', () => {
  it('creates one function per binding, triggered by the names it stands for', () => {
    const inngest = new FakeInngest();
    const { functions } = functionsOver(inngest);

    functions.create(['orders.placed.*', 'orders.paid']);

    expect(functions.size).toBe(2);
    expect(inngest.created.map(({ config }) => config)).toEqual([
      {
        id: 'orders-placed',
        name: 'Handle orders.placed.*',
        triggers: [{ event: 'orders.placed' }],
      },
      {
        id: 'orders-paid',
        name: 'Handle orders.paid',
        triggers: [{ event: 'orders.paid' }],
      },
    ]);
    expect(functions.summary()).toBe('orders.placed.* → 1, orders.paid → 1');
    expect(functions.triggers().get('orders.placed.*')).toEqual([
      'orders.placed',
    ]);
  });

  it('gives the functions retries only when asked', () => {
    const plain = new FakeInngest();
    functionsOver(plain).functions.create(['orders.placed']);
    const retried = new FakeInngest();
    functionsOver(retried, { retries: 7 }).functions.create(['orders.placed']);

    expect(plain.created[0].config).not.toHaveProperty('retries');
    expect(retried.created[0].config.retries).toBe(7);
  });

  it('layers the configuration: defaults, then the strategy, then the pattern', () => {
    const inngest = new FakeInngest();
    const { functions } = functionsOver(
      inngest,
      {
        retries: 7,
        functionConfig: (pattern) =>
          pattern === 'orders.placed'
            ? { concurrency: { limit: 2 }, retries: 3 }
            : undefined,
      },
      {
        'orders.placed': { id: 'place-order', retries: 1 },
      },
    );

    functions.create(['orders.placed', 'orders.paid']);

    expect(inngest.created[0].config).toEqual({
      id: 'place-order',
      name: 'Handle orders.placed',
      retries: 1,
      concurrency: { limit: 2 },
      triggers: [{ event: 'orders.placed' }],
    });
    expect(inngest.created[1].config).toMatchObject({
      id: 'orders-paid',
      retries: 7,
    });
  });

  it('never lets the configuration choose the triggers', () => {
    const inngest = new FakeInngest();
    const { functions } = functionsOver(
      inngest,
      { functionConfig: { triggers: [{ event: 'x' }] } as never },
      {},
    );

    functions.create(['orders.placed']);

    expect(inngest.created[0].config.triggers).toEqual([
      { event: 'orders.placed' },
    ]);
  });

  it('runs the handler bound for the pattern, with what Inngest brought', async () => {
    const inngest = new FakeInngest();
    const { functions, run } = functionsOver(inngest);
    functions.create(['orders.placed']);
    const event = { name: 'orders.placed', data: {} };

    const answer = await inngest.created[0].handler({
      event,
      step: 'step',
      runId: 'r-1',
      attempt: 2,
    });

    expect(answer).toBe('ran');
    expect(run).toHaveBeenCalledWith('orders.placed', event, 'step', 'r-1', 2, [
      event,
    ]);
  });

  it('hands a batch over whole', async () => {
    const inngest = new FakeInngest();
    const { functions, run } = functionsOver(inngest);
    functions.create(['orders.placed']);
    const events = [
      { name: 'orders.placed', data: { n: 1 } },
      { name: 'orders.placed', data: { n: 2 } },
    ];

    await inngest.created[0].handler({
      event: events[0],
      events,
      step: 'step',
      runId: 'r-1',
      attempt: 0,
    });

    expect(run.mock.calls[0][5]).toBe(events);
  });

  it('creates nothing for a binding another one claimed, and warns', () => {
    const inngest = new FakeInngest();
    const { functions } = functionsOver(inngest);
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    functions.create(['orders.placed.*', 'orders.placed']);

    expect(functions.size).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("'orders.placed.*' stands for no event name"),
    );
    warn.mockRestore();
  });

  it('refuses a function that would carry more triggers than Inngest takes', () => {
    const names = Array.from(
      { length: InngestTriggers.MAX + 1 },
      (_, i) => `orders.e${i}`,
    );
    const { functions } = functionsOver(new FakeInngest(), {
      triggers: () => names,
    });

    expect(() => functions.create(['orders.#'])).toThrow(
      /takes at most 10 triggers/,
    );
  });

  it('refuses two bindings that would create the same function id', () => {
    const { functions } = functionsOver(
      new FakeInngest(),
      {},
      {
        'orders.paid': { id: 'orders-placed' },
      },
    );

    expect(() => functions.create(['orders.placed', 'orders.paid'])).toThrow(
      /'orders.placed' and 'orders.paid' would both create the Inngest function 'orders-placed'/,
    );
  });

  it('forgets every function when cleared', () => {
    const { functions } = functionsOver(new FakeInngest());
    functions.create(['orders.placed']);

    functions.clear();

    expect(functions.size).toBe(0);
    expect(functions.all()).toEqual([]);
    expect(functions.triggers().size).toBe(0);
  });
});
