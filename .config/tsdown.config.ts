import { defineConfig } from 'tsdown'

export default defineConfig([
  // CLI bundled: all deps inlined, single self-contained file
  {
    entry: { 'cutdown-parser': '../src/parser-cli.ts' },
    format: 'esm',
    target: 'node18',
    outputOptions: {
      banner: '#!/usr/bin/env node',
      entryFileNames: '[name].js',
      chunkFileNames: '[name]-[hash].js',
    },
    outDir: '../dist',
    nodeProtocol: true,
  },

  // Library: importable API with type declarations, deps kept external
  {
    entry: { index: '../src/index.ts' },
    format: 'esm',
    target: 'node18',
    outDir: '../dist',
    outputOptions: {
      entryFileNames: '[name].js',
      chunkFileNames: '[name]-[hash].js',
    },
    dts: { tsconfig: '.config/tsconfig.dts.json' },
  },
])
