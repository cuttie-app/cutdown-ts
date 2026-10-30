import { parseDocument } from './document.ts'
import { ASTResult } from '../transform'
import type { NodeMap } from '../types/document'
import type { ParseState } from './block.ts'

/** The Cutdown language version this parser implements (§20.2 clause 6). */
export const LANGUAGE_VERSION = '0.12.0'

/**
 * Parse a Cutdown string into an AST.
 *
 * Returns an `ASTResult<NodeMap>` with:
 *  - `.ast` — the Document tree
 *  - `.diagnostics` — every warning of the parse (§17)
 *  - `.walk(visitors)` — exit-only typed traversal
 *
 * To enrich the AST with plugins, wrap with `pipeline()` from `@cutdown/transform`.
 */
export function parse(input: string): ASTResult<NodeMap> {
  const st: ParseState = { diagnostics: [], comments: [] }
  const ast = parseDocument(input, st)
  return new ASTResult(ast, st.diagnostics)
}
