import { FakeInngest } from './fake-inngest';

describe('FakeInngest', () => {
  it('records each event of a send, batched or not', async () => {
    const inngest = new FakeInngest();

    const one = await inngest.send({ name: 'a' });
    const two = await inngest.send([{ name: 'b' }, { name: 'c' }]);

    expect(inngest.sent.map(({ name }) => name)).toEqual(['a', 'b', 'c']);
    expect(one.ids).toEqual(['fake-0']);
    expect(two.ids).toEqual(['fake-1', 'fake-2']);
  });

  it('finds a created function by its id, and forgets everything when reset', async () => {
    const inngest = new FakeInngest();
    const handler = async () => 'ok';
    inngest.createFunction({ id: 'orders-placed' }, handler);
    await inngest.send({ name: 'a' });

    expect(inngest.functionWithId('orders-placed')?.handler).toBe(handler);
    expect(inngest.functionWithId('missing')).toBeUndefined();

    inngest.reset();

    expect(inngest.sent).toEqual([]);
    expect(inngest.created).toEqual([]);
  });
});
