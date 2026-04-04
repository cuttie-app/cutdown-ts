// ─── Diagnostics ─────────────────────────────────────────────────────────────

export type DiagnosticLevel = 'warning' | 'error'

export interface Diagnostic {
  code: string
  level: DiagnosticLevel
  message?: string
}

// ─── Attributes ───────────────────────────────────────────────────────────────

export type AttributeValue = string | string[]

export interface Attribute {
  key: string
  value: AttributeValue
}

export interface AttrsParseResult {
  attrs: Attribute[]
  diagnostics: Diagnostic[]
}
