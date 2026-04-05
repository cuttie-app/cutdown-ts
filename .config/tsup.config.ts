import { defineConfig } from 'tsup'

const cliShared = {
  entry: { 'cutdown-parser': 'src/parser-cli.ts' },
  format: ['esm' as const],
  target: 'node18' as const,
  banner: { js: '#!/usr/bin/env node' },
}

export default defineConfig([
  // CLI bundled: all deps inlined, single self-contained file
  {
    ...cliShared,
    outDir: 'dist/bundled',
    noExternal: [/.*/],
  },
  // Library: importable API with type declarations, deps kept external
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node18',
    outDir: 'dist/lib',
    dts: true,
    tsconfig: '.config/tsconfig.dts.json',
  },
])
