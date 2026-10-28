import { InngestEvent } from './inngest-event';

describe('InngestEvent', () => {
  const packet = { pattern: 'orders.placed', data: { id: 'o-1' } };

  it('reads a plain packet as the pattern and its data', () => {
    expect(InngestEvent.outgoing(packet, packet)).toEqual({
      name: 'orders.placed',
      data: { id: 'o-1' },
    });
  });

  it('sends what a serializer built when it built an event', () => {
    const built = {
      name: 'orders/placed',
      data: { id: 'o-1' },
      user: { tenant: 'acme' },
    };

    expect(InngestEvent.outgoing(built, packet)).toBe(built);
  });

  it('does not mistake a payload with a name for an event', () => {
    const named = { pattern: 'customers.renamed', data: { name: 'Ada' } };

    expect(InngestEvent.outgoing(named.data, named)).toEqual({
      name: 'customers.renamed',
      data: { name: 'Ada' },
    });
  });

  it.each([
    ['a string', 'plain'],
    ['a number', 42],
    ['null', null],
    ['an array', [1, 2]],
  ])('wraps %s, which Inngest would refuse as data', (_, data) => {
    expect(InngestEvent.dataOf(data)).toEqual({ value: data });
  });
});
