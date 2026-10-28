import { InngestTestEngine } from '@inngest/test';
import type { EventPayload, InngestFunction } from 'inngest';

import type { InngestStrategy } from '../../src';

/** Runs the function a strategy created for `pattern` in process, as Inngest would invoke it. */
export const runFunction = async (
  strategy: InngestStrategy,
  pattern: string,
  event: EventPayload & Record<string, unknown>,
) => {
  const fn = strategy
    .unwrap<{ functions: ReadonlyMap<string, InngestFunction.Any> }>()
    .functions.get(pattern);
  if (!fn) {
    throw new Error(`no function was created for '${pattern}'`);
  }
  return new InngestTestEngine({ function: fn, events: [event] }).execute();
};
