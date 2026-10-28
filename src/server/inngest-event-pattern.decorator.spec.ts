import {
  PATTERN_EXTRAS_METADATA,
  PATTERN_METADATA,
  TRANSPORT_METADATA,
} from '@nestjs/microservices/constants';
import { FakeInngest } from '../testing/fake-inngest';
import { InngestStrategy } from './inngest.strategy';
import { INNGEST_TRANSPORT } from './inngest.transport';
import { InngestEventPattern } from './inngest-event-pattern.decorator';

class Handlers {
  @InngestEventPattern('orders.paid', { retries: 2, concurrency: { limit: 1 } })
  paid() {}

  @InngestEventPattern('orders.placed')
  placed() {}
}

const metadataOf = (key: string, method: keyof Handlers) =>
  Reflect.getMetadata(key, Handlers.prototype[method]);

describe('InngestEventPattern', () => {
  it('declares the pattern, bound to this transport', () => {
    expect(metadataOf(PATTERN_METADATA, 'paid')).toEqual(['orders.paid']);
    expect(metadataOf(TRANSPORT_METADATA, 'paid')).toBe(INNGEST_TRANSPORT);
  });

  it('carries the function configuration in the extras the strategy reads', () => {
    expect(metadataOf(PATTERN_EXTRAS_METADATA, 'paid')).toEqual({
      inngest: { retries: 2, concurrency: { limit: 1 } },
    });
    expect(metadataOf(PATTERN_EXTRAS_METADATA, 'placed')).toEqual({});
  });

  it('names the transport the strategy runs as', () => {
    const strategy = new InngestStrategy({
      inngest: new FakeInngest().asClient(),
    });

    expect(strategy.transportId).toBe(INNGEST_TRANSPORT);
    expect(INNGEST_TRANSPORT).toBe(
      Symbol.for('nestjs-inngest-transport.inngest'),
    );
  });
});
