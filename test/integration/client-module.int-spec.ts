import { Inject, Injectable, Module } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { ClientsModule } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';

import { InngestClientProxy, InngestRecordBuilder } from '../../src';
import { FakeInngest } from '../../src/testing';

const ORDERS_EVENTS = 'ORDERS_EVENTS';

@Injectable()
class Checkout {
  constructor(@Inject(ORDERS_EVENTS) private readonly events: ClientProxy) {}

  place(id: string) {
    return lastValueFrom(
      this.events.emit(
        'orders.placed',
        new InngestRecordBuilder({ id }).setIdempotencyKey(id).build(),
      ),
    );
  }
}

const inngest = new FakeInngest();

@Module({
  imports: [
    ClientsModule.register([
      {
        name: ORDERS_EVENTS,
        customClass: InngestClientProxy,
        options: { inngest: inngest.asClient() },
      },
    ]),
  ],
  providers: [Checkout],
})
class CheckoutModule {}

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: ORDERS_EVENTS,
        useFactory: () => ({
          customClass: InngestClientProxy,
          options: { inngest: inngest.asClient() },
        }),
      },
    ]),
  ],
  providers: [Checkout],
})
class AsyncCheckoutModule {}

describe.each([
  ['ClientsModule.register', CheckoutModule],
  ['ClientsModule.registerAsync', AsyncCheckoutModule],
])('InngestClientProxy through %s', (_, module) => {
  beforeEach(() => inngest.reset());

  it('is injected as the ClientProxy, and sends what it is given', async () => {
    const testing = await Test.createTestingModule({
      imports: [module],
    }).compile();
    await testing.init();

    expect(testing.get(ORDERS_EVENTS)).toBeInstanceOf(InngestClientProxy);
    await testing.get(Checkout).place('o-1');

    expect(inngest.sent).toEqual([
      {
        name: 'orders.placed',
        data: { id: 'o-1' },
        user: {},
        id: 'orders.placed:o-1',
      },
    ]);
    await testing.close();
  });
});
