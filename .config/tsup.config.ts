import { defineConfig } from 'tsup'

export default defineConfig([
  // CLI bundled: all deps inlined, single self-contained file
  {
    entry: { 'cutdown-parser': 'src/parser-cli.ts' },
    format: ['esm' as const],
    target: 'node18' as const,
    banner: { js: '#!/usr/bin/env node' },
    outDir: 'dist',
    noExternal: [/.*/],
  },

  // Library: importable API with type declarations, deps kept external
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    dts: true,
    tsconfig: '.config/tsconfig.dts.json',
  },
])
