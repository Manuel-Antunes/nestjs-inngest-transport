import { NonRetriableError, RetryAfterError } from 'inngest';
import { firstValueFrom } from 'rxjs';

import { InngestExceptionFilter } from './inngest-exception.filter';

describe('InngestExceptionFilter', () => {
  const filter = new InngestExceptionFilter();

  it.each([
    ['a NonRetriableError', new NonRetriableError('do not retry')],
    ['a RetryAfterError', new RetryAfterError('later', 5_000)],
    ['an ordinary Error', new Error('boom')],
    ['something that is not an Error', { code: 42 }],
  ])('rethrows %s as it is', async (_, exception) => {
    await expect(firstValueFrom(filter.catch(exception))).rejects.toBe(
      exception,
    );
  });
});
