import { firstValueFrom } from 'rxjs';
import { FakeInngest } from '../testing/fake-inngest';
import { InngestClientProxy } from './inngest-client.proxy';
import { InngestRecordBuilder } from './inngest-record.builder';

const proxyOver = (inngest = new FakeInngest()) => ({
  inngest,
  proxy: new InngestClientProxy({ inngest: inngest.asClient() }),
});

describe('InngestClientProxy', () => {
  it('refuses to be built without a client', () => {
    expect(
      () => new InngestClientProxy({ inngest: undefined as never }),
    ).toThrow(/needs an inngest client/);
  });

  it('sends the pattern as the name and the data as the data', async () => {
    const { inngest, proxy } = proxyOver();

    await firstValueFrom(proxy.emit('orders.placed', { id: 'o-1' }));

    expect(inngest.sent).toEqual([
      { name: 'orders.placed', data: { id: 'o-1' }, user: {} },
    ]);
  });

  it('wraps data that is not an object, which Inngest would refuse', async () => {
    const { inngest, proxy } = proxyOver();

    await firstValueFrom(proxy.emit('orders.placed', 'plain'));

    expect(inngest.sent[0]).toMatchObject({ data: { value: 'plain' } });
  });

  it('carries what a record asks for: user, sessions, idempotency and time', async () => {
    const { inngest, proxy } = proxyOver();

    await firstValueFrom(
      proxy.emit(
        'orders.placed',
        new InngestRecordBuilder({ id: 'o-1' })
          .setMetadata({ tenant: 'acme' })
          .setUser({ tenant: 'override' })
          .setSession('customer_id', 'c-1')
          .setIdempotencyKey('m-1')
          .setTimestamp(new Date(5))
          .build(),
      ),
    );

    expect(inngest.sent[0]).toEqual({
      name: 'orders.placed',
      data: { id: 'o-1' },
      user: { tenant: 'override' },
      meta: { sessions: { customer_id: 'c-1' } },
      id: 'orders.placed:m-1',
      ts: 5,
    });
  });

  it('refuses an event that would carry more sessions than Inngest takes', async () => {
    const { proxy } = proxyOver();
    const sessions = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`s${i}`, i]),
    );

    await expect(
      firstValueFrom(
        proxy.emit('orders.placed', {
          data: {},
          options: { sessions },
          [Symbol.for('nestjs-inngest-transport.inngest-record')]: true,
        }),
      ),
    ).rejects.toThrow(/orders\.placed would carry 6/);
  });

  it('answers a call with a refusal, because an event has nobody to answer', async () => {
    const { proxy } = proxyOver();

    await expect(
      firstValueFrom(proxy.send('orders.placed', {})),
    ).rejects.toThrow(/gets no reply.*Use emit\(\)/);
  });
});
