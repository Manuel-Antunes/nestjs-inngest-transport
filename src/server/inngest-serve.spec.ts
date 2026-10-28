import { PassThrough } from 'node:stream';

import { Inngest } from 'inngest';

import { InngestServe } from './inngest-serve';

const options = {
  inngest: new Inngest({ id: 'spec', isDev: true }),
  functions: [],
  servePath: '/api/inngest',
};

const adapter = (
  type: string | undefined,
  instance: object,
  listening = false,
) => ({
  ...(type ? { getType: () => type } : {}),
  getInstance: () => instance,
  getHttpServer: () => ({ listening }),
});

describe('InngestServe', () => {
  describe('which platform', () => {
    it.each(['express', 'fastify'] as const)(
      'believes an adapter that says it is %s',
      (type) => {
        expect(InngestServe.platformOf(adapter(type, {}) as never)).toBe(type);
      },
    );

    it('recognizes an adapter that does not say, by its instance', () => {
      expect(
        InngestServe.platformOf(
          adapter(undefined, { register: () => undefined }) as never,
        ),
      ).toBe('fastify');
      expect(
        InngestServe.platformOf(
          adapter(undefined, { use: () => undefined }) as never,
        ),
      ).toBe('express');
    });

    it('refuses anything else, naming it', () => {
      expect(() => InngestServe.platformOf(adapter('h3', {}) as never)).toThrow(
        /adapter is 'h3'/,
      );
    });
  });

  it('refuses to mount without an adapter', () => {
    expect(() => InngestServe.mount(undefined, options)).toThrow(
      /needs a Nest HTTP adapter/,
    );
  });

  it('refuses to mount once the host is listening, where no request would reach it', () => {
    expect(() =>
      InngestServe.mount(
        adapter('express', { use: () => undefined }, true) as never,
        options,
      ),
    ).toThrow(/before the application listens/);
  });

  it('registers inngest/fastify as a plugin, with where to serve and what to advertise', () => {
    const register = vi.fn();

    const platform = InngestServe.mount(
      adapter('fastify', { register }) as never,
      { ...options, serveOrigin: 'http://orders:3000' },
    );

    expect(platform).toBe('fastify');
    expect(register.mock.calls[0][1]).toEqual({
      client: options.inngest,
      functions: [],
      options: { servePath: '/api/inngest', serveOrigin: 'http://orders:3000' },
    });
  });

  describe('on Express', () => {
    const mounted = () => {
      const use = vi.fn();
      InngestServe.mount(adapter('express', { use }) as never, options);
      const [path, handler] = use.mock.calls[0];
      return { path, handler };
    };

    it('mounts a middleware at the serve path', () => {
      const { path, handler } = mounted();

      expect(path).toBe('/api/inngest');
      expect(handler).toBeTypeOf('function');
    });

    it('reads the JSON body itself when no parser ran before it', async () => {
      const { handler } = mounted();
      const request = Object.assign(new PassThrough(), {
        method: 'POST',
        headers: {},
        body: undefined as unknown,
      });
      request.end('{"event":{"name":"orders.placed"}}');

      await handler(
        request,
        {
          setHeader: () => undefined,
          status: () => ({ send: () => undefined }),
        },
        () => undefined,
      ).catch(() => undefined);

      expect(request.body).toEqual({ event: { name: 'orders.placed' } });
    });

    it('hands a body that is not JSON to the error handler', async () => {
      const { handler } = mounted();
      const request = Object.assign(new PassThrough(), {
        method: 'POST',
        headers: {},
        body: undefined,
      });
      request.end('{not json');
      const next = vi.fn();

      await handler(request, {}, next);

      expect(next).toHaveBeenCalledWith(expect.any(SyntaxError));
    });

    it('leaves a body a parser already read alone', async () => {
      const { handler } = mounted();
      const body = { already: 'parsed' };
      const request = Object.assign(new PassThrough(), {
        method: 'PUT',
        headers: {},
        body,
      });

      await handler(
        request,
        {
          setHeader: () => undefined,
          status: () => ({ send: () => undefined }),
        },
        () => undefined,
      ).catch(() => undefined);

      expect(request.body).toBe(body);
    });
  });
});
