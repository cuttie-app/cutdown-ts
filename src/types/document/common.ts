// ─── Diagnostics ─────────────────────────────────────────────────────────────

export type DiagnosticLevel = 'warning' | 'error'

export interface Diagnostic {
  code: string
  level: DiagnosticLevel
  message?: string
}

// ─── Attributes ───────────────────────────────────────────────────────────────

export type AttributeValue = string | string[]

export type Attribute =
  | { key: 'id'; value: string }
  | { key: 'class'; value: string[] }
  | { key: string; value: string }

export interface AttrsParseResult {
  attrs: Attribute[]
  diagnostics: Diagnostic[]
}
