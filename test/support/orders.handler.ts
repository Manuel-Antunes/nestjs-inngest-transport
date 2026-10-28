import type {
  CallHandler,
  CanActivate,
  ExecutionContext,
  NestInterceptor,
  PipeTransform,
} from '@nestjs/common';
import {
  Controller,
  Injectable,
  Module,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { NonRetriableError, RetryAfterError } from 'inngest';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import type { InngestPatternExtras } from '../../src';
import {
  InngestContext,
  InngestEventPattern,
  InngestExceptionFilter,
} from '../../src';

export interface Delivery {
  readonly pattern: string;
  readonly data: unknown;
  readonly eventName: string;
  readonly runId: string;
  readonly attempt: number;
  readonly user?: unknown;
}

@Injectable()
export class Deliveries {
  readonly received: Delivery[] = [];
  readonly steps: string[] = [];

  record(data: unknown, context: InngestContext): void {
    this.received.push({
      pattern: context.getPattern(),
      data,
      eventName: context.getEventName(),
      runId: context.getRunId(),
      attempt: context.getAttempt(),
      user: (context.getEvent() as { user?: unknown }).user,
    });
  }

  of(pattern: string): Delivery[] {
    return this.received.filter((delivery) => delivery.pattern === pattern);
  }

  reset(): void {
    this.received.length = 0;
    this.steps.length = 0;
  }
}

@Injectable()
class RefuseBlockedCustomers implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const data = context.switchToRpc().getData<{ customerId?: string }>();
    return data.customerId !== 'blocked';
  }
}

@Injectable()
class UppercaseIds implements PipeTransform {
  transform(value: { id?: string }) {
    return { ...value, id: value.id?.toUpperCase() };
  }
}

@Injectable()
class StampAnswer implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const rpc = context.switchToRpc().getContext<InngestContext>();
    return next
      .handle()
      .pipe(map((answer) => ({ answer, stampedBy: rpc.getPattern() })));
  }
}

@Controller()
export class OrdersHandler {
  constructor(private readonly deliveries: Deliveries) {}

  @InngestEventPattern('orders.placed.*')
  @UseGuards(RefuseBlockedCustomers)
  @UseInterceptors(StampAnswer)
  placed(
    @Payload(UppercaseIds) order: { id: string },
    @Ctx() context: InngestContext,
  ) {
    this.deliveries.record(order, context);
    return { accepted: order.id };
  }

  @EventPattern<string>('orders.paid', {
    inngest: { id: 'charge-order', concurrency: { limit: 1 }, retries: 2 },
  } satisfies InngestPatternExtras)
  async paid(@Payload() order: { id: string }, @Ctx() context: InngestContext) {
    this.deliveries.record(order, context);
    const step = context.getStep();
    const charged = await step.run('charge', () => {
      this.deliveries.steps.push('charge');
      return `charged ${order.id}`;
    });
    const receipt = await step.run('receipt', () => {
      this.deliveries.steps.push('receipt');
      return `receipt for ${charged}`;
    });
    return receipt;
  }

  @InngestEventPattern('orders.flaky')
  flaky(
    @Payload() order: { failUntil: number },
    @Ctx() context: InngestContext,
  ) {
    this.deliveries.record(order, context);
    if (context.getAttempt() < order.failUntil) {
      throw new Error(`attempt ${context.getAttempt()} failed`);
    }
    return 'recovered';
  }

  @InngestEventPattern('orders.unfiltered-refusal')
  unfilteredRefusal(@Payload() order: unknown, @Ctx() context: InngestContext) {
    this.deliveries.record(order, context);
    throw new NonRetriableError('this order can never be shipped');
  }
}

@Controller()
@UseFilters(InngestExceptionFilter)
export class FilteredOrdersHandler {
  constructor(private readonly deliveries: Deliveries) {}

  @InngestEventPattern('orders.refused')
  refused(@Payload() order: unknown, @Ctx() context: InngestContext) {
    this.deliveries.record(order, context);
    throw new NonRetriableError('this order can never be shipped');
  }

  @InngestEventPattern('orders.later', { retries: 3 })
  later(@Payload() order: unknown, @Ctx() context: InngestContext) {
    this.deliveries.record(order, context);
    if (context.getAttempt() === 0) {
      throw new RetryAfterError('the warehouse is closed', '1s');
    }
    return 'shipped';
  }
}

@Module({
  controllers: [OrdersHandler, FilteredOrdersHandler],
  providers: [Deliveries],
})
export class OrdersModule {}
