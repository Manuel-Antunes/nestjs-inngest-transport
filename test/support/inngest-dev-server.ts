import { createServer } from 'node:net';

import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, TestContainers, Wait } from 'testcontainers';

export interface DevServerRun {
  readonly run_id: string;
  readonly status: 'Running' | 'Completed' | 'Failed' | 'Cancelled' | string;
  readonly output?: unknown;
  readonly function_id?: string;
}

interface DevServerEvent {
  readonly internal_id: string;
  readonly id: string;
  readonly name: string;
  readonly data: unknown;
  readonly user?: unknown;
}

/**
 * The Inngest dev server in a container, reaching back to an application listening on this host.
 *
 * The dev server calls the application at whatever URL it registered, so the application has to
 * advertise one the container can reach: `host.testcontainers.internal`, which Testcontainers maps
 * to a port of this host. That is the `serveOrigin` the strategy is given — the same thing a
 * deployment behind a proxy or in Kubernetes has to say.
 */
export class InngestDevServer {
  static readonly IMAGE = process.env.INNGEST_IMAGE ?? 'inngest/inngest:latest';
  private static readonly PORT = 8288;

  private constructor(
    private readonly container: StartedTestContainer,
    readonly appPort: number,
  ) {}

  /** Starts the dev server, and reserves the host port the application will listen on. */
  static async start(): Promise<InngestDevServer> {
    const appPort = await InngestDevServer.freePort();
    await TestContainers.exposeHostPorts(appPort);
    const container = await new GenericContainer(InngestDevServer.IMAGE)
      .withExposedPorts(InngestDevServer.PORT)
      .withCommand(['inngest', 'dev', '--no-discovery', '--no-poll'])
      .withWaitStrategy(Wait.forHttp('/', InngestDevServer.PORT))
      .withStartupTimeout(120_000)
      .start();
    return new InngestDevServer(container, appPort);
  }

  /** Where the application sends events and registers. */
  get baseUrl(): string {
    return `http://${this.container.getHost()}:${this.container.getMappedPort(InngestDevServer.PORT)}`;
  }

  /** Where the dev server reaches the application. */
  get serveOrigin(): string {
    return `http://host.testcontainers.internal:${this.appPort}`;
  }

  /** Asks the application to register its functions with the dev server, as a deploy would. */
  async register(servePath = '/api/inngest'): Promise<void> {
    const response = await fetch(
      `http://127.0.0.1:${this.appPort}${servePath}`,
      { method: 'PUT' },
    );
    if (!response.ok) {
      throw new Error(
        `registration failed: ${response.status} ${await response.text()}`,
      );
    }
  }

  async events(name: string): Promise<DevServerEvent[]> {
    const response = await fetch(
      `${this.baseUrl}/v1/events?name=${encodeURIComponent(name)}`,
    );
    return ((await response.json()) as { data?: DevServerEvent[] }).data ?? [];
  }

  async runsOf(event: DevServerEvent): Promise<DevServerRun[]> {
    const response = await fetch(
      `${this.baseUrl}/v1/events/${event.internal_id}/runs`,
    );
    return ((await response.json()) as { data?: DevServerRun[] }).data ?? [];
  }

  /** Every run of every event named `name`. */
  async runs(name: string): Promise<DevServerRun[]> {
    const runs = await Promise.all(
      (await this.events(name)).map((event) => this.runsOf(event)),
    );
    return runs.flat();
  }

  /**
   * What a run returned. The REST API leaves `output` empty, so it is read the way the dev server's
   * own UI reads it: the run's trace names its output, and the output is fetched by that id.
   */
  async outputOf(run: DevServerRun): Promise<unknown> {
    const trace = await this.graphql<{ runTrace: { outputID: string | null } }>(
      `{ runTrace(runID: "${run.run_id}") { outputID } }`,
    );
    if (!trace.runTrace.outputID) {
      return undefined;
    }
    const output = await this.graphql<{
      runTraceSpanOutputByID: { data: string | null };
    }>(
      `{ runTraceSpanOutputByID(outputID: "${trace.runTrace.outputID}") { data } }`,
    );
    const data = output.runTraceSpanOutputByID.data;
    return data === null ? undefined : JSON.parse(data);
  }

  async stop(): Promise<void> {
    await this.container.stop();
  }

  private async graphql<T>(query: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}/v0/gql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const body = (await response.json()) as { data?: T; errors?: unknown };
    if (!body.data) {
      throw new Error(
        `dev server GraphQL failed: ${JSON.stringify(body.errors)}`,
      );
    }
    return body.data;
  }

  private static freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, () => {
        const { port } = server.address() as { port: number };
        server.close(() => resolve(port));
      });
    });
  }
}

/** Polls `probe` until it stops throwing, or rethrows its last failure after `timeoutMs`. */
export const eventually = async <T>(
  probe: () => Promise<T> | T,
  timeoutMs = 30_000,
  intervalMs = 250,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await probe();
    } catch (failure) {
      if (Date.now() > deadline) {
        throw failure;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
};
