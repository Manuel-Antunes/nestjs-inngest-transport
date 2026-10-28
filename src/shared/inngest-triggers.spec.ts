import { InngestTriggers } from './inngest-triggers';

const catalog: Record<string, string[]> = {
  'orders.#': ['orders.placed', 'orders.paid', 'orders.shipped'],
};

const resolve = (pattern: string): string[] =>
  catalog[pattern] ?? InngestTriggers.literal(pattern);

describe('InngestTriggers', () => {
  describe('literal', () => {
    it('leaves a literal name alone', () => {
      expect(InngestTriggers.literal('orders.placed')).toEqual([
        'orders.placed',
      ]);
    });

    it('drops a trailing one-segment wildcard, as a routing key would match it', () => {
      expect(InngestTriggers.literal('orders.placed.*')).toEqual([
        'orders.placed',
      ]);
    });

    it('answers nothing for a pattern only a catalog can spell out', () => {
      expect(InngestTriggers.literal('orders.#')).toEqual([]);
      expect(InngestTriggers.literal('orders.*.eu')).toEqual([]);
      expect(InngestTriggers.literal('*')).toEqual([]);
    });

    it('can be passed around without its class', () => {
      const { literal } = InngestTriggers;

      expect(['a', 'b.*'].flatMap(literal)).toEqual(['a', 'b']);
    });
  });

  describe('claim', () => {
    it('gives an event to the more specific binding, so one event is one run', () => {
      const claimed = InngestTriggers.claim(
        ['orders.#', 'orders.paid.*'],
        resolve,
      );

      expect(claimed.get('orders.paid.*')).toEqual(['orders.paid']);
      expect(claimed.get('orders.#')).toEqual([
        'orders.placed',
        'orders.shipped',
      ]);
    });

    it('prefers a literal binding over every wildcard, as a broker does', () => {
      const claimed = InngestTriggers.claim(
        ['orders.#', 'orders.placed'],
        resolve,
      );

      expect(claimed.get('orders.placed')).toEqual(['orders.placed']);
      expect(claimed.get('orders.#')).not.toContain('orders.placed');
    });

    it('breaks a tie between two equally broad patterns by registration order', () => {
      const claimed = InngestTriggers.claim(['a.*', 'b.*'], (pattern) =>
        pattern === 'a.*' ? ['x'] : ['x'],
      );

      expect(claimed.get('a.*')).toEqual(['x']);
      expect(claimed.get('b.*')).toEqual([]);
    });

    it('leaves a binding with nothing left to claim empty', () => {
      const claimed = InngestTriggers.claim(
        ['orders.placed.*', 'orders.placed'],
        resolve,
      );

      expect(claimed.get('orders.placed')).toEqual(['orders.placed']);
      expect(claimed.get('orders.placed.*')).toEqual([]);
    });

    it('counts a name a resolver repeats once', () => {
      const claimed = InngestTriggers.claim(['x.#'], () => ['x.a', 'x.a']);

      expect(claimed.get('x.#')).toEqual(['x.a']);
    });

    it('keeps the patterns in the order they were bound', () => {
      const claimed = InngestTriggers.claim(
        ['orders.#', 'orders.placed'],
        resolve,
      );

      expect([...claimed.keys()]).toEqual(['orders.#', 'orders.placed']);
    });
  });

  it('derives a function id a URL can carry', () => {
    expect(InngestTriggers.functionId('orders.#')).toBe('orders');
    expect(InngestTriggers.functionId('orders.Placed.*')).toBe('orders-placed');
    expect(InngestTriggers.functionId('app/user.created')).toBe(
      'app-user-created',
    );
  });
});
