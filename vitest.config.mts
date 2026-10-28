import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const decorators = () =>
  swc.vite({
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  });

export default defineConfig({
  plugins: [decorators()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['test/support/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts', 'src/testing.ts'],
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'lcov'],
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.int-spec.ts'],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          testTimeout: 120_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'package',
          include: ['test/package/**/*.pkg-spec.ts'],
          testTimeout: 60_000,
        },
      },
    ],
  },
});
