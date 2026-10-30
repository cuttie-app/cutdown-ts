import type { JsonArray, JsonObject, JsonValue } from '../types/document'
import { LIMITS } from './utils.ts'

/**
 * §6.1.1 JSON attribute values: strict RFC 8259 on one line, restricted to
 * I-JSON (RFC 7493). A repeated name, a lone surrogate, or an out-of-range
 * number is malformed; object names such as `__proto__` are ordinary keys.
 *
 * Returns the parsed value and the index after it, or null when the text at
 * `start` is not an object or array that satisfies all of the above.
 */
export function parseJsonValue(s: string, start: number): { value: JsonObject | JsonArray; end: number } | null {
  const c = s[start]
  if (c !== '{' && c !== '[') return null
  const p = new JsonParser(s, start)
  try {
    const value = p.value(1) as JsonObject | JsonArray
    let length = 0
    for (const _ of s.slice(start, p.pos)) length++
    if (length > LIMITS.jsonLength) return null
    return { value, end: p.pos }
  } catch {
    return null
  }
}

class JsonParser {
  pos: number
  constructor(
    readonly s: string,
    start: number
  ) {
    this.pos = start
  }

  private fail(): never {
    throw new Error('json')
  }

  private ws(): void {
    while (this.s[this.pos] === ' ' || this.s[this.pos] === '\t') this.pos++
  }

  value(depth: number): JsonValue {
    this.ws()
    const c = this.s[this.pos]
    if (c === '{') return this.object(depth)
    if (c === '[') return this.array(depth)
    if (c === '"') return this.string()
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return this.number()
    for (const [lit, v] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (this.s.startsWith(lit, this.pos)) {
        this.pos += lit.length
        return v
      }
    }
    this.fail()
  }

  private object(depth: number): JsonObject {
    if (depth > LIMITS.jsonDepth) this.fail()
    this.pos++
    const entries: [string, JsonValue][] = []
    const seen = new Set<string>()
    this.ws()
    if (this.s[this.pos] === '}') {
      this.pos++
      return Object.fromEntries(entries)
    }
    for (;;) {
      this.ws()
      if (this.s[this.pos] !== '"') this.fail()
      const key = this.string()
      if (seen.has(key)) this.fail()
      seen.add(key)
      this.ws()
      if (this.s[this.pos] !== ':') this.fail()
      this.pos++
      entries.push([key, this.value(depth + 1)])
      this.ws()
      const c = this.s[this.pos++]
      if (c === '}') break
      if (c !== ',') this.fail()
    }
    // Object.fromEntries defines own properties, so `__proto__` stays a key.
    return Object.fromEntries(entries)
  }

  private array(depth: number): JsonArray {
    if (depth > LIMITS.jsonDepth) this.fail()
    this.pos++
    const items: JsonValue[] = []
    this.ws()
    if (this.s[this.pos] === ']') {
      this.pos++
      return items
    }
    for (;;) {
      items.push(this.value(depth + 1))
      this.ws()
      const c = this.s[this.pos++]
      if (c === ']') break
      if (c !== ',') this.fail()
    }
    return items
  }

  private string(): string {
    this.pos++
    let out = ''
    for (;;) {
      const c = this.s[this.pos]
      if (c === undefined || c === '\n') this.fail()
      const code = c.charCodeAt(0)
      if (code < 0x20) this.fail()
      if (c === '"') {
        this.pos++
        break
      }
      if (c !== '\\') {
        out += c
        this.pos++
        continue
      }
      const e = this.s[this.pos + 1]
      this.pos += 2
      switch (e) {
        case '"':
        case '\\':
        case '/':
          out += e
          break
        case 'b':
          out += '\b'
          break
        case 'f':
          out += '\f'
          break
        case 'n':
          out += '\n'
          break
        case 'r':
          out += '\r'
          break
        case 't':
          out += '\t'
          break
        case 'u': {
          const hex = this.s.slice(this.pos, this.pos + 4)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail()
          out += String.fromCharCode(parseInt(hex, 16))
          this.pos += 4
          break
        }
        default:
          this.fail()
      }
    }
    // I-JSON: no lone surrogates.
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)) this.fail()
    return out
  }

  private number(): number {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.pos))
    if (!m) this.fail()
    this.pos += m[0].length
    const n = Number(m[0])
    if (!Number.isFinite(n)) this.fail()
    // An integer written without fraction or exponent must be exact (I-JSON).
    if (m[2] === undefined && m[3] === undefined && !Number.isSafeInteger(n)) this.fail()
    return n
  }
}
