import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  tsconfig: './tsconfig.lib.json',
  target: 'node22',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: false,
  outDir: 'dist',
  external: [/^@nestjs\//, /^inngest(\/.*)?$/, 'rxjs', 'reflect-metadata'],
});
