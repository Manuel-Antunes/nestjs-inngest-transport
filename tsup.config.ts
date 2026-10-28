import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
  format: ['esm', 'cjs'],
  dts: {
    compilerOptions: { composite: false, emitDeclarationOnly: false },
  },
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
