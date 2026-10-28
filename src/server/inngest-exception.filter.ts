import type { RpcExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { throwError } from 'rxjs';

/**
 * **Lets a handler's error reach Inngest as itself.**
 *
 * Nest's default RPC exception filter turns any error that is not an `RpcException` into
 * `{ status: 'error', message: 'Internal server error' }`. Inngest then sees a plain object: the run
 * still fails and is retried, but a `NonRetriableError` is retried anyway, a `RetryAfterError` loses
 * its delay, and the run's error in the dashboard says nothing about what happened.
 *
 * This filter rethrows whatever it catches, untouched. Apply it to the controllers that handle
 * Inngest events:
 *
 * ```ts
 * @Controller()
 * @UseFilters(InngestExceptionFilter)
 * export class OrdersHandler { … }
 * ```
 *
 * or to the whole microservice, when it does not share the HTTP application's configuration
 * (`connectMicroservice(options)` without `inheritAppConfig: true`):
 *
 * ```ts
 * app.connectMicroservice(options).useGlobalFilters(new InngestExceptionFilter());
 * ```
 */
@Catch()
export class InngestExceptionFilter implements RpcExceptionFilter<unknown> {
  catch(exception: unknown): Observable<never> {
    return throwError(() => exception);
  }
}
