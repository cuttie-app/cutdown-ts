/**
 * Cutdown conformance test runner.
 *
 * Loads every *.yaml file from the cutdown-spec tests directory,
 * runs the TS parser, and does a deep subset-match against the expected output.
 *
 * Test format:
 *   id, section, description — metadata
 *   input                    — raw Cutdown text
 *   ast                      — expected first-page children (subset match)
 *   pages                    — expected full pages array (subset match); overrides ast
 *   diagnostics              — expected diagnostics (subset match, order-independent)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from '../src/index.js';
import yaml from 'js-yaml';

// ─── Paths ────────────────────────────────────────────────────────────────────

const SPEC_TESTS_DIR = resolve(
  './external/spec/tests',
);

// ─── Test fixture type ────────────────────────────────────────────────────────

interface Fixture {
  id: string;
  section: string;
  description: string;
  input: string;
  ast?: unknown[];
  pages?: unknown[];
  diagnostics?: Array<{ code: string; level: string }>;
}

// ─── Deep subset match ────────────────────────────────────────────────────────

/**
 * Assert that `actual` is a superset of `expected`:
 *  - All keys present in `expected` must exist in `actual` with matching values.
 *  - Extra keys in `actual` are allowed.
 *  - Arrays must have the same length; each element is subset-matched.
 *  - Primitives are compared with ===.
 *  - `null` matches `null`.
 *  - `{}` (empty object) matches any object.
 */
function subsetMatch(actual: unknown, expected: unknown, path = ''): void {
  if (expected === null || expected === undefined) {
    expect(actual, path).toBe(expected);
    return;
  }

  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path}: expected array`).toBe(true);
    const actualArr = actual as unknown[];
    expect(actualArr.length, `${path}.length`).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      subsetMatch(actualArr[i], expected[i], `${path}[${i}]`);
    }
    return;
  }

  if (typeof expected === 'object') {
    expect(typeof actual, `${path}: expected object`).toBe('object');
    expect(actual, `${path}: not null`).not.toBeNull();
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;
    for (const key of Object.keys(expObj)) {
      subsetMatch(actObj[key], expObj[key], `${path}.${key}`);
    }
    return;
  }

  expect(actual, path).toBe(expected);
}

// ─── Load fixtures ────────────────────────────────────────────────────────────

function loadFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!entry.endsWith('.yaml')) continue;
      const raw = readFileSync(full, 'utf-8');
      // Quote the description field if it contains `: ` which confuses YAML parsers
      const fixed = raw.replace(/^(description: )(.+)$/m, (_m, key: string, val: string) => {
        if (!val.startsWith('"') && !val.startsWith("'")) {
          return `${key}"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }
        return _m;
      });
      const doc = yaml.load(fixed) as Fixture;
      if (doc && doc.id) fixtures.push(doc);
    }
  }

  walk(SPEC_TESTS_DIR);
  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

// ─── Normalise AST for comparison ─────────────────────────────────────────────

/**
 * Strip undefined fields and convert the AST to a plain object for comparison.
 * Also strips the top-level `type: 'Document'` wrapper.
 */
function clean(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(clean);
  if (typeof val === 'object') {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) obj[k] = clean(v);
    }
    return obj;
  }
  return val;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const fixtures = loadFixtures();

describe('Cutdown conformance', () => {
  for (const fixture of fixtures) {
    it(`[${fixture.section}] ${fixture.id} — ${fixture.description}`, () => {
      const { ast, diagnostics } = parse(fixture.input ?? '');
      const cleanAst = clean(ast) as { type: string; children: unknown[] };

      if (fixture.pages !== undefined) {
        // Full pages comparison
        subsetMatch(cleanAst.children, fixture.pages, 'pages');
      } else if (fixture.ast !== undefined) {
        // First page children comparison
        const pages = cleanAst.children as Array<{ meta: unknown; children: unknown[] }>;
        const firstPageChildren = pages[0]?.children ?? [];
        subsetMatch(firstPageChildren, fixture.ast, 'ast');
      }

      if (fixture.diagnostics !== undefined) {
        const cleanDiags = clean(diagnostics) as unknown[];
        // Each expected diagnostic must appear in actual (order-independent)
        for (const expDiag of fixture.diagnostics) {
          const found = (cleanDiags as Array<{ code: string; level: string }>).some(
            d => d.code === expDiag.code && d.level === expDiag.level,
          );
          expect(found, `diagnostic ${expDiag.code} (${expDiag.level}) not found`).toBe(true);
        }
        // No unexpected diagnostics
        expect(cleanDiags.length, 'unexpected extra diagnostics').toBe(fixture.diagnostics.length);
      } else {
        // No diagnostics expected
        expect(diagnostics.length, 'unexpected diagnostics: ' + diagnostics.map(d => d.code).join(', ')).toBe(0);
      }
    });
  }
});
