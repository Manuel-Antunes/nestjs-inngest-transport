/** What {@link InngestStrategy.status} reports: where the strategy is in its lifecycle. */
export enum InngestStatus {
  STARTING = 'starting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}

/** The events {@link InngestStrategy.on} takes a listener for. */
export enum InngestEventsMap {
  ERROR = 'error',
  LISTENING = 'listening',
  CLOSE = 'close',
}

/** The listener signature of each event. */
export type InngestEvents = {
  error: (error: Error) => void;
  listening: () => void;
  close: () => void;
};
