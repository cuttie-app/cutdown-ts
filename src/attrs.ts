import type { Attribute, AttributeValue, Diagnostic } from './types.js';

export interface AttrsParseResult {
  attrs: Attribute[];
  diagnostics: Diagnostic[];
}

/**
 * Parse the content of a single `{...}` attribute block (including braces).
 * Handles: #id  .class  key=value  key="spaced value"  bare-key
 *
 * Ordering: attributes are emitted in the order they appear in the block.
 * Multiple .class tokens are merged into a single class entry at the position
 * of the first .class token.
 */
export function parseAttrBlock(raw: string): AttrsParseResult {
  const diagnostics: Diagnostic[] = [];

  const inner = raw.trim();
  if (!inner.startsWith('{') || !inner.endsWith('}')) {
    return { attrs: [], diagnostics };
  }
  const content = inner.slice(1, -1).trim();
  if (content === '') return { attrs: [], diagnostics };

  // Ordered list of pending attrs (placeholder index for class)
  const result: Attribute[] = [];
  let classPlaceholderIdx = -1; // position in result where class attr will go
  let classValues: string[] = [];
  let seenId = false;
  let hasClassDot = false;
  let hasClassKey = false;
  const seenCustomKeys = new Set<string>();

  let i = 0;
  while (i < content.length) {
    while (i < content.length && content[i] === ' ') i++;
    if (i >= content.length) break;

    const c = content[i];

    if (c === '#') {
      // #id
      i++;
      const start = i;
      while (i < content.length && isIdChar(content[i])) i++;
      const id = content.slice(start, i);
      if (id === '') continue;
      if (seenId) {
        diagnostics.push({ code: 'CDN-0020', level: 'warning' });
        continue;
      }
      seenId = true;
      result.push({ key: 'id', value: id });

    } else if (c === '.') {
      // .class
      i++;
      const start = i;
      while (i < content.length && isIdChar(content[i])) i++;
      const cls = content.slice(start, i);
      if (cls === '') continue;
      hasClassDot = true;
      if (classPlaceholderIdx === -1) {
        // Reserve a slot for class at current position
        classPlaceholderIdx = result.length;
        result.push({ key: 'class', value: [] }); // placeholder
      }
      classValues.push(cls);

    } else {
      // key or key=value or bare-key
      const start = i;
      while (i < content.length && content[i] !== '=' && content[i] !== ' ') i++;
      const key = content.slice(start, i);
      if (key === '') { i++; continue; }

      if (i < content.length && content[i] === '=') {
        i++; // consume =
        let value: string;
        if (i < content.length && content[i] === '"') {
          i++;
          const vs = i;
          while (i < content.length && content[i] !== '"') i++;
          value = content.slice(vs, i);
          if (i < content.length) i++;
        } else {
          const vs = i;
          while (i < content.length && content[i] !== ' ') i++;
          value = content.slice(vs, i);
        }

        if (key === 'class') {
          if (hasClassDot) {
            // .class syntax has priority — drop class= and warn
            diagnostics.push({ code: 'CDN-0021', level: 'warning' });
            continue;
          }
          if (hasClassKey) {
            // Duplicate class= key
            diagnostics.push({ code: 'CDN-0022', level: 'warning' });
            continue;
          }
          hasClassKey = true;
          // Will be overridden later if .class appears — for now insert at current position
          // If .class appears later, CDN-0021 will fire and drop the class= value
          result.push({ key: 'class', value });
          continue;
        }

        if (seenCustomKeys.has(key)) {
          diagnostics.push({ code: 'CDN-0022', level: 'warning' });
          continue;
        }
        seenCustomKeys.add(key);
        result.push({ key, value });

      } else {
        // Bare key (value = "")
        if (seenCustomKeys.has(key)) {
          diagnostics.push({ code: 'CDN-0022', level: 'warning' });
          continue;
        }
        seenCustomKeys.add(key);
        result.push({ key, value: '' });
      }
    }
  }

  // Fill in the class placeholder with merged values
  if (classPlaceholderIdx >= 0 && classValues.length > 0) {
    result[classPlaceholderIdx] = { key: 'class', value: classValues };
  }

  // Remove any empty placeholder that didn't get filled
  const finalResult = result.filter((a, idx) => {
    if (a.key === 'class' && Array.isArray(a.value) && (a.value as string[]).length === 0) return false;
    return true;
  });

  return { attrs: finalResult, diagnostics };
}

/**
 * Extract and parse all consecutive `{...}` blocks from the END of a string.
 * Returns: stripped text + groups (left-to-right order) + diagnostics.
 *
 * Used for scope-chain distribution (§5.2).
 */
export function extractTrailingAttrGroups(text: string): {
  text: string;
  groups: Attribute[][];
  diagnostics: Diagnostic[];
} {
  const allDiagnostics: Diagnostic[] = [];
  const groups: Attribute[][] = [];
  let s = text.trimEnd();

  while (s.endsWith('}')) {
    const end = s.length;
    let depth = 0;
    let start = end - 1;
    let found = false;
    for (let i = end - 1; i >= 0; i--) {
      if (s[i] === '}') depth++;
      else if (s[i] === '{') {
        depth--;
        if (depth === 0) { start = i; found = true; break; }
      }
    }
    if (!found || depth !== 0) break;

    const block = s.slice(start, end);
    const { attrs, diagnostics } = parseAttrBlock(block);
    allDiagnostics.push(...diagnostics);
    groups.unshift(attrs); // prepend: groups stay in left-to-right order
    s = s.slice(0, start).trimEnd();
  }

  return { text: s, groups, diagnostics: allDiagnostics };
}

function isIdChar(c: string): boolean {
  return /[a-zA-Z0-9._-]/.test(c);
}
