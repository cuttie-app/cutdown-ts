// ─── Location ────────────────────────────────────────────────────────────────

/** §A.5: raw-file UTF-16 code-unit offsets, end-exclusive. */
export interface Loc {
  file?: string
  start: number
  end: number
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/** §17.1: there is no `error` level — no input is an error. */
export type DiagnosticLevel = 'warning' | 'info'

export interface Diagnostic {
  code: string
  level: DiagnosticLevel
  loc?: Loc
  message: string
}

// ─── Attributes ───────────────────────────────────────────────────────────────

export type AttributeValue = string | string[]

/** §A.7 */
export type Attribute =
  | { key: 'id'; value: string }
  | { key: 'class'; value: string[] }
  | { key: string; value: string }

// ─── Reflections ─────────────────────────────────────────────────────────────

/** §7.2: a `##` comment on a line that belongs to a block. */
export interface LineReflection {
  loc: Loc
  text: string
}

/** §7.3: a CommentBlock or an orphan `##` line, held on its Page. */
export interface SegmentReflection {
  loc: Loc
  text: string
  /** Child-index path to the block the comment stands before. */
  before: number[]
}

// ─── PathResourceLocator ─────────────────────────────────────────────────────

/** §8: a value, not a segment — no `_type`. */
export interface QueryParam {
  key: string
  value: string
}

export interface PathResourceLocator {
  path: string
  query: QueryParam[]
  fragment: string
}
