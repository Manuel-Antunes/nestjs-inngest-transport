import type { CustomTransportStrategy } from '@nestjs/microservices';
import { Server } from '@nestjs/microservices';

import { OrdersApp } from '../support/orders-app';

class OtherTransport extends Server implements CustomTransportStrategy {
  override transportId = Symbol('other-transport');

  listen(callback: () => void) {
    callback();
  }

  close() {}

  on() {}

  unwrap<T>(): T {
    return undefined as T;
  }
}

describe('a hybrid application with another transport beside Inngest', () => {
  it('gives InngestEventPattern handlers to Inngest alone, and plain EventPattern ones to both', async () => {
    const other = new OtherTransport();
    const orders = await OrdersApp.create({
      platform: 'express',
      beforeStart: (app) => app.connectMicroservice({ strategy: other }),
    });
    try {
      const inngestPatterns = [...orders.strategy.getHandlers().keys()];
      const otherPatterns = [...other.getHandlers().keys()];

      expect(inngestPatterns).toEqual(
        expect.arrayContaining([
          'orders.placed.*',
          'orders.paid',
          'orders.later',
        ]),
      );
      expect(otherPatterns).toEqual(['orders.paid']);
    } finally {
      await orders.close();
    }
  });
});
