import type { InngestEvents } from './inngest.events';

/** The listeners registered on an {@link InngestStrategy}, by the event they asked for. */
export class InngestListeners {
  private readonly entries: {
    event: keyof InngestEvents;
    callback: InngestEvents[keyof InngestEvents];
  }[] = [];

  /** Registers `callback` for every later `emit` of `event`. */
  add<EventKey extends keyof InngestEvents>(
    event: EventKey,
    callback: InngestEvents[EventKey],
  ): void {
    this.entries.push({ event, callback });
  }

  /** Calls every listener of `event`, in registration order, with `args`. */
  emit(event: keyof InngestEvents, ...args: unknown[]): void {
    for (const entry of this.entries) {
      if (entry.event === event) {
        (entry.callback as (...params: unknown[]) => void)(...args);
      }
    }
  }
}
