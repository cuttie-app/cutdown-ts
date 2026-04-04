import { normalize } from './utils.ts'
import { BlockParser } from './block.ts'
import { ASTResult } from '../transform/index.ts'
import type { NodeMap } from '../types/document/node-map.ts'

/**
 * Parse a Cutdown string into an AST.
 *
 * Returns an `ASTResult<NodeMap>` with:
 *  - `.ast` — the Document tree
 *  - `.diagnostics` — any warnings or errors encountered
 *  - `.walk(visitors)` — exit-only typed traversal
 *
 * To enrich the AST with plugins, wrap with `pipeline()` from `@cutdown/transform`.
 */
export function parse(input: string): ASTResult<NodeMap> {
  const lines = normalize(input)
  const parser = new BlockParser(lines)
  const ast = parser.parseDocument()
  return new ASTResult(ast, parser.diagnostics)
}
