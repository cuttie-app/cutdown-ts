import type { Document } from '../types/document/blocks.ts'
import type { Diagnostic } from '../types/document/common.ts'
import type { NodeMap } from '../types/document/node-map.ts'
import type { Apply, Plugin, PluginDelta, Visitors } from './types.ts'
import { walkDocument } from './walker.ts'

// ─── ASTResult ────────────────────────────────────────────────────────────────

/**
 * The result of parsing (or pipeline-enriching) a Cutdown document.
 *
 * `TMap` defaults to `NodeMap` for the plain parser output.
 * After `pipeline()` folds in plugins, `TMap` becomes `Apply<NodeMap, [P1, P2, ...]>`,
 * which makes `walk()` visitors typed to the enriched node shapes.
 */
export class ASTResult<TMap extends Record<string, unknown> = NodeMap> {
  readonly ast: Document
  readonly diagnostics: Diagnostic[]

  constructor(ast: Document, diagnostics: Diagnostic[]) {
    this.ast = ast
    this.diagnostics = diagnostics
  }

  /**
   * Walk the AST with typed exit-only visitors.
   * Children are visited before their parent.
   * Returning a new node from a visitor replaces the original in the tree.
   */
  walk(visitors: Visitors<TMap>): void {
    walkDocument(this.ast, visitors as Visitors<NodeMap>)
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Extract the delta tuple from a plugins tuple.
 * Used to accumulate type-level enrichments from multiple plugins.
 */
type ExtractDeltas<TPlugins extends readonly Plugin[]> = {
  [K in keyof TPlugins]: TPlugins[K] extends Plugin<infer D> ? D : PluginDelta
}

/**
 * Compose a parser with a set of plugins to produce an enriched parser.
 *
 * The returned function:
 * 1. Calls the base parser
 * 2. Runs each plugin's exit-only visitors over the AST (in order)
 * 3. Returns an `ASTResult` typed to the accumulated plugin enrichments
 *
 * @example
 * ```ts
 * const enrichedParse = pipeline(parse, [linkPlugin, mentionPlugin])
 * const result = enrichedParse('Hello [[world]]')
 * result.walk({
 *   Link: (node) => { ... }, // node is EnrichedLink if linkPlugin declared it
 * })
 * ```
 */
export function pipeline<const TPlugins extends readonly Plugin[]>(
  parser: (input: string) => ASTResult<NodeMap>,
  plugins: TPlugins,
): (input: string) => ASTResult<Apply<NodeMap, ExtractDeltas<TPlugins>>> {
  return (input: string) => {
    const result = parser(input)
    for (const plugin of plugins) {
      walkDocument(result.ast, plugin.visitors as Visitors<NodeMap>)
    }
    return result as unknown as ASTResult<Apply<NodeMap, ExtractDeltas<TPlugins>>>
  }
}
