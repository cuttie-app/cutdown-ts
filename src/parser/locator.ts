import type { Diagnostic, PathResourceLocator, QueryParam } from '../types/document'
import { LIMITS, diag, isBidiControl, isControl, scalarLength } from './utils.ts'

/** Who owns the path: it decides what a trailing `/` and an empty path mean (§8.5). */
export type LocatorOwner = 'file' | 'inject' | 'image' | 'page'

export interface LocatorResult {
  /** The path as written, escapes resolved except `\\` and `\{{` (§8.3 step 1) */
  raw: string
  /** Decomposed and normalized; null when the path is invalid (§8.5) */
  locator: PathResourceLocator | null
  diagnostics: Diagnostic[]
  /** The normalized path, kept for classification even when invalid (§4.17) */
  normalized: string
}

interface Part {
  ch: string
  escaped: boolean
}

/** §8.2: the characters a backslash resolves; `\\` and `\{{` stay for the consumer. */
const RESOLVED = new Set('()[]?#&=^~@:')

/** Read the written extent into characters, marking escaped ones. */
function readParts(written: string): Part[] {
  const parts: Part[] = []
  for (let i = 0; i < written.length; i++) {
    const c = written[i]!
    if (c === '\\' && i + 1 < written.length) {
      const e = written[i + 1]!
      if (RESOLVED.has(e)) {
        parts.push({ ch: e, escaped: true })
        i++
        continue
      }
      if (e === '\\') {
        parts.push({ ch: '\\', escaped: true }, { ch: '\\', escaped: true })
        i++
        continue
      }
      if (e === '{' && written[i + 2] === '{') {
        parts.push({ ch: '\\', escaped: true }, { ch: '{', escaped: true }, { ch: '{', escaped: true })
        i += 2
        continue
      }
    }
    parts.push({ ch: c, escaped: false })
  }
  return parts
}

const join = (ps: Part[]) => ps.map((p) => p.ch).join('')

/**
 * §8 PathResourceLocator: decompose, normalize, and validate a path written
 * in source. `written` is the extent as written, soft breaks already folded.
 */
export function readLocator(written: string, owner: LocatorOwner): LocatorResult {
  const parts = readParts(written)
  const raw = join(parts)
  const diagnostics: Diagnostic[] = []

  // §8.3 decomposition on unescaped `?` and `#`
  let i = 0
  const pathParts: Part[] = []
  while (i < parts.length && !(!parts[i]!.escaped && (parts[i]!.ch === '?' || parts[i]!.ch === '#'))) {
    pathParts.push(parts[i++]!)
  }
  const query: QueryParam[] = []
  let fragment = ''
  if (parts[i]?.ch === '?') {
    i++
    let pair: Part[] = []
    let overflow = false
    const flushPair = () => {
      if (pair.length > 0) {
        const eq = pair.findIndex((p) => !p.escaped && p.ch === '=')
        const key = join(eq < 0 ? pair : pair.slice(0, eq))
        const value = eq < 0 ? '' : join(pair.slice(eq + 1))
        if (query.length < LIMITS.queryPairs) query.push({ key, value })
        else overflow = true
      }
      pair = []
    }
    while (i < parts.length && !(!parts[i]!.escaped && parts[i]!.ch === '#')) {
      const p = parts[i++]!
      if (!p.escaped && p.ch === '&') flushPair()
      else pair.push(p)
    }
    flushPair()
    if (overflow) diagnostics.push(diag('CDN-0042'))
  }
  if (parts[i]?.ch === '#') fragment = join(parts.slice(i + 1))

  const written_path = join(pathParts)
  const { path, climbed } = normalizePath(written_path)

  if (scalarLength(raw) > LIMITS.valueLength) diagnostics.push(diag('CDN-0035'))

  let valid = written_path !== ''
  for (const c of raw) if (isControl(c) || isBidiControl(c)) valid = false
  if (climbed) valid = false
  if (path.endsWith('/') && !(owner === 'inject' || (owner === 'file' && path === '/'))) valid = false
  if (owner === 'image' && parts.length > 0) {
    const first = parts[0]!
    if (!first.escaped && '#^~@'.includes(first.ch)) valid = false
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(written)) valid = false
  }

  if (!valid) {
    let hint: string | undefined
    if (written.startsWith('http://')) hint = 'did you mean https://?'
    else if (climbed) hint = 'paths start at the project root'
    diagnostics.push(diag('CDN-0032', undefined, hint))
    return { raw, locator: null, diagnostics, normalized: path }
  }
  return { raw, locator: { path, query, fragment }, diagnostics, normalized: path }
}

/** §8.4 root and normalization; `climbed` marks a `..` above the root. */
export function normalizePath(p: string): { path: string; climbed: boolean } {
  const segments = p.split('/')
  const out: string[] = []
  let climbed = false
  let trailing = false
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k]!
    const last = k === segments.length - 1
    if (seg === '' || seg === '.') {
      if (last) trailing = true
      continue
    }
    if (seg === '..') {
      if (out.length === 0) climbed = true
      else out.pop()
      if (last) trailing = true
      continue
    }
    out.push(seg)
  }
  let path = '/' + out.join('/')
  if (trailing && out.length > 0) path += '/'
  return { path: path.normalize('NFC'), climbed }
}
