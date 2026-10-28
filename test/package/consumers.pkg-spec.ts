import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const peers = ['@nestjs', 'inngest', 'rxjs', 'reflect-metadata'];

const expectedExports = [
  'InngestClientProxy',
  'InngestContext',
  'InngestEvent',
  'InngestEventPattern',
  'InngestEventsMap',
  'InngestExceptionFilter',
  'InngestFunctions',
  'InngestListeners',
  'InngestRecordBuilder',
  'InngestServe',
  'InngestStatus',
  'InngestStrategy',
  'InngestTriggers',
];

const consumerBody = `
  const names = Object.keys(main).filter((name) => /^Inngest/.test(name)).sort();
  const strategy = new main.InngestStrategy({ inngest: new Inngest({ id: 'consumer', isDev: true }) });
  const proxy = new main.InngestClientProxy({ inngest: new testing.FakeInngest().asClient() });
  console.log(JSON.stringify({
    names,
    transport: String(strategy.transportId.description),
    proxy: proxy.constructor.name,
    fake: typeof testing.FakeInngest,
  }));
`;

/**
 * **What a user installs, loaded the way a user loads it.** The tarball `pnpm pack` writes is
 * unpacked into a project of its own, beside the peer dependencies, and imported from a CommonJS
 * and an ES module consumer: a missing file in `files`, a wrong `exports` condition or a format the
 * build did not emit fails here and nowhere else.
 */
describe('the packed package', () => {
  let project: string;

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'nestjs-inngest-transport-'));
    const packed = execFileSync(
      'pnpm',
      ['pack', '--pack-destination', project],
      { cwd: root, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .pop() as string;
    const installed = join(project, 'node_modules', 'nestjs-inngest-transport');
    mkdirSync(installed, { recursive: true });
    execFileSync('tar', [
      '-xzf',
      packed,
      '-C',
      installed,
      '--strip-components=1',
    ]);
    for (const peer of peers) {
      symlinkSync(
        join(root, 'node_modules', peer),
        join(project, 'node_modules', peer),
      );
    }
    writeFileSync(
      join(project, 'consumer.cjs'),
      `require('reflect-metadata');
const main = require('nestjs-inngest-transport');
const testing = require('nestjs-inngest-transport/testing');
const { Inngest } = require('inngest');
${consumerBody}`,
    );
    writeFileSync(
      join(project, 'consumer.mjs'),
      `import 'reflect-metadata';
import * as main from 'nestjs-inngest-transport';
import * as testing from 'nestjs-inngest-transport/testing';
import { Inngest } from 'inngest';
${consumerBody}`,
    );
  });

  afterAll(() => rmSync(project, { recursive: true, force: true }));

  it.each(['consumer.cjs', 'consumer.mjs'])('loads from %s', (consumer) => {
    const output = JSON.parse(
      execFileSync('node', [consumer], { cwd: project, encoding: 'utf8' }),
    );

    expect(output).toEqual({
      names: expectedExports,
      transport: 'nestjs-inngest-transport.inngest',
      proxy: 'InngestClientProxy',
      fake: 'function',
    });
  });

  it('ships its build, its license and its readme, and no source or test', () => {
    const files = execFileSync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      { cwd: root, encoding: 'utf8' },
    );
    const [packed] = JSON.parse(files) as { files: { path: string }[] }[];
    const listed = packed.files.map(({ path }) => path);

    expect(listed).toEqual(
      expect.arrayContaining([
        'dist/index.js',
        'dist/index.cjs',
        'dist/index.d.ts',
        'dist/index.d.cts',
        'dist/testing.js',
        'dist/testing.cjs',
        'LICENSE',
        'README.md',
        'package.json',
      ]),
    );
    expect(listed.filter((path) => /^(src|test)\//.test(path))).toEqual([]);
  });
});
