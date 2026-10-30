import type { Attribute, Diagnostic } from '../types/document'
import { parseJsonValue } from './json.ts'
import { LIMITS, diag, isControl, isIdChar, isIdValue, isUnicodeWs, trimWsEnd } from './utils.ts'

export type AttrScan =
  | { ok: true; end: number; attrs: Attribute[]; diagnostics: Diagnostic[] }
  | { ok: false; sliceEnd: number }

const isSep = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n'

/**
 * §6.1.1 Scan one attribute group starting at the `{` at `i`. `s` is an inline
 * source in which `\n` marks a soft break: the line end separates tokens, and
 * no token crosses it.
 *
 * A group that violates the grammar, or whose `}` never arrives, reports the
 * end of its verbatim slice (§6.1.3): the `}` or the end of the `{`'s own
 * line, whichever comes first.
 */
export function scanAttrGroup(s: string, i: number, to: number = s.length): AttrScan {
  const fail = (): AttrScan => ({ ok: false, sliceEnd: sliceEnd(s, i, to) })
  const g = new GroupBuilder()
  let p = i + 1
  let first = true
  for (;;) {
    let sep = false
    while (p < to && isSep(s[p])) {
      p++
      sep = true
    }
    if (p >= to) return fail()
    const c = s[p]!
    if (c === '}') {
      const { attrs, diagnostics } = g.finish()
      return { ok: true, end: p + 1, attrs, diagnostics }
    }
    if (!first && !sep) return fail()
    first = false

    if (c === '#') {
      const start = ++p
      while (p < to && !isSep(s[p]) && s[p] !== '}' && !isControl(s[p]!)) p++
      if (p === start) return fail()
      g.id(s.slice(start, p))
    } else if (c === '.') {
      const start = ++p
      while (p < to && isClassChar(s[p]!)) p++
      if (p === start) return fail()
      g.classes([s.slice(start, p)])
    } else if (isIdChar(c) && c !== '.') {
      const start = p
      while (p < to && isIdChar(s[p])) p++
      const key = s.slice(start, p)
      if (s[p] !== '=') {
        g.flag(key)
        continue
      }
      p++
      const v = s[p]
      if (v === '"') {
        let out = ''
        p++
        for (;;) {
          const d = s[p]
          if (p >= to || d === undefined || d === '\n') return fail()
          if (d === '"') break
          if (d === '\\') {
            const e = s[p + 1]
            if (e === undefined || e === '\n' || isControl(e)) return fail()
            // §6.1.1: `\"` gives `"`; `\\` and every other pair stay for the consumer.
            out += e === '"' ? '"' : d + e
            p += 2
            continue
          }
          if (isControl(d)) return fail()
          out += d
          p++
        }
        p++
        if (!g.value(key, out)) return fail()
      } else if (v === '{' || v === '[') {
        const json = parseJsonValue(s.slice(0, to), p)
        if (!json || key === 'id' || key === 'class') return fail()
        p = json.end
        g.json(key, json.value)
      } else {
        const start = p
        while (p < to && !isSep(s[p]) && s[p] !== '}' && s[p] !== '"' && !isControl(s[p]!)) p++
        if (!g.value(key, s.slice(start, p))) return fail()
      }
    } else return fail()
  }
}

/** CLASS_NAME characters (§6.1.1) */
const isClassChar = (c: string) =>
  c !== '\n' && !isUnicodeWs(c) && !isControl(c) && c !== '{' && c !== '}' && c !== '"' && c !== '=' && c !== '#'

/** End of a dead `{` slice: the closing `}` or the end of the `{`'s own line. */
function sliceEnd(s: string, i: number, to: number): number {
  let depth = 0
  let inString = false
  for (let k = i; k < to; k++) {
    const c = s[k]
    if (c === '\n') return k
    if (inString) {
      if (c === '\\') k++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return k + 1
  }
  return to
}

/** Accumulates the entries of one group with the §6.1.1 dedup and limit rules. */
class GroupBuilder {
  private entries: Attribute[] = []
  private classList: string[] | null = null
  private hasId = false
  private keys = new Set<string>()
  private diagnostics: Diagnostic[] = []
  private classOverflow = false
  private entryOverflow = false

  private add(a: Attribute): void {
    if (this.entries.length >= LIMITS.attrEntries) {
      this.entryOverflow = true
      return
    }
    this.entries.push(a)
  }

  id(raw: string): void {
    if (this.hasId) {
      this.diagnostics.push(diag('CDN-0020'))
      return
    }
    if (this.entries.length >= LIMITS.attrEntries) {
      this.entryOverflow = true
      return
    }
    this.hasId = true
    if (!isIdValue(raw)) this.diagnostics.push(diag('CDN-0037', undefined, raw))
    this.add({ key: 'id', value: raw.normalize('NFC') })
  }

  classes(names: string[]): void {
    for (const name of names) {
      if (name === '') continue
      if (this.classList === null) {
        if (this.entries.length >= LIMITS.attrEntries) {
          this.entryOverflow = true
          return
        }
        this.classList = []
        this.add({ key: 'class', value: this.classList })
      }
      if (this.classList.includes(name)) continue
      if (this.classList.length >= LIMITS.classes) {
        this.classOverflow = true
        continue
      }
      this.classList.push(name)
    }
  }

  flag(key: string): void {
    this.value(key, '')
  }

  /** Returns false when the value violates the grammar for its key. */
  value(key: string, value: string): boolean {
    if (key === 'id') {
      this.id(value)
      return true
    }
    if (key === 'class') {
      this.classes(value.split(/[ \t]+/))
      return true
    }
    if (this.keys.has(key)) {
      this.diagnostics.push(diag('CDN-0022', undefined, key))
      return true
    }
    this.keys.add(key)
    this.add({ key, value })
    return true
  }

  json(key: string, value: Attribute['value']): void {
    if (this.keys.has(key)) {
      this.diagnostics.push(diag('CDN-0022', undefined, key))
      return
    }
    this.keys.add(key)
    this.add({ key, value } as Attribute)
  }

  finish(): { attrs: Attribute[]; diagnostics: Diagnostic[] } {
    if (this.classOverflow) this.diagnostics.push(diag('CDN-0034'))
    if (this.entryOverflow) this.diagnostics.push(diag('CDN-0041'))
    return { attrs: this.entries, diagnostics: this.diagnostics }
  }
}

/**
 * A run of attribute groups that makes up the whole of `text` (whitespace
 * between and around them allowed), or null. Used for attribute lines and
 * the trailing attribute sequence of a FileBlock, EmbedBlock, or fence line.
 */
export function parseGroupRun(text: string): { groups: Attribute[][]; diagnostics: Diagnostic[] } | null {
  const groups: Attribute[][] = []
  const diagnostics: Diagnostic[] = []
  let p = 0
  for (;;) {
    while (p < text.length && (text[p] === ' ' || text[p] === '\t')) p++
    if (p >= text.length) break
    if (text[p] !== '{' || text[p + 1] === '{') return null
    const r = scanAttrGroup(text, p)
    if (!r.ok) return null
    groups.push(r.attrs)
    diagnostics.push(...r.diagnostics)
    p = r.end
  }
  return groups.length > 0 ? { groups, diagnostics } : null
}

/**
 * Split a line into its body and one trailing attribute sequence: whitespace
 * followed by one or more `{…}` groups that close the line (§8.1). With
 * `needWs: false` the sequence may follow the body directly.
 */
export function splitTrailingGroups(
  line: string,
  needWs = true
): { body: string; groups: Attribute[][]; diagnostics: Diagnostic[] } {
  for (let k = 0; k < line.length; k++) {
    if (line[k] === '\\') {
      k++
      continue
    }
    if (line[k] !== '{' || line[k + 1] === '{') continue
    if (needWs && k > 0 && line[k - 1] !== ' ' && line[k - 1] !== '\t') continue
    if (needWs && k === 0) continue
    const run = parseGroupRun(line.slice(k))
    if (run) return { body: trimWsEnd(line.slice(0, k)), ...run }
  }
  return { body: line, groups: [], diagnostics: [] }
}

/**
 * Merge attributes moving onto a node that may already carry some: the node's
 * own entries come first, classes merge by §6.1.1, and a key it already has
 * is kept.
 */
export function mergeAttrs(own: Attribute[], incoming: Attribute[]): Attribute[] {
  if (own.length === 0) return incoming
  const out = own.map((a) => (a.key === 'class' ? { key: 'class' as const, value: [...(a.value as string[])] } : a))
  for (const a of incoming) {
    const existing = out.find((b) => b.key === a.key)
    if (!existing) out.push(a)
    else if (a.key === 'class') {
      const list = existing.value as string[]
      for (const c of a.value as string[]) if (!list.includes(c)) list.push(c)
    }
  }
  return out
}
