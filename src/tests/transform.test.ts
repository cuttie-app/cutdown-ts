/**
 * Tests for the D3 transformer pipeline:
 *   - ASTResult.walk() — typed exit-only visitor
 *   - pipeline() — composing plugins into an enriched parse function
 */

import { describe, it, expect } from 'vitest'
import { parse } from '../parser'
import { pipeline } from '../transform'
import type { Plugin } from '../transform/types.ts'
import type { Link, Text } from '../types/document'

// ─── walk() ───────────────────────────────────────────────────────────────────

describe('ASTResult.walk()', () => {
  it('visits Text nodes', () => {
    const result = parse('Hello world')
    const texts: string[] = []
    result.walk({
      Text: (node) => { texts.push(node.value) },
    })
    expect(texts).toEqual(['Hello world'])
  })

  it('visits nodes exit-first (children before parent)', () => {
    const result = parse('**italic text**')
    const order: string[] = []
    result.walk({
      Text: (node) => { order.push(`Text:${node.value}`) },
      Emphasis: () => { order.push('Emphasis') },
    })
    // Text is child of Emphasis — should appear before Emphasis
    expect(order).toEqual(['Text:italic text', 'Emphasis'])
  })

  it('visits Paragraph nodes', () => {
    const result = parse('First\n\nSecond')
    const paragraphs: number[] = []
    result.walk({
      Paragraph: (node) => { paragraphs.push(node.children.length) },
    })
    expect(paragraphs.length).toBe(2)
  })

  it('replacement: visitor can return a new node', () => {
    const result = parse('hello')
    result.walk({
      Text: (node): Text => ({ ...node, value: node.value.toUpperCase() }),
    })
    const texts: string[] = []
    result.walk({
      Text: (node) => { texts.push(node.value) },
    })
    expect(texts).toEqual(['HELLO'])
  })

  it('visits inline nodes inside a Section heading', () => {
    const result = parse('= Heading text')
    const texts: string[] = []
    result.walk({
      Text: (node) => { texts.push(node.value) },
    })
    expect(texts).toContain('Heading text')
  })

  it('visits Link nodes', () => {
    const result = parse('[click here](https://example.com)')
    const links: string[] = []
    result.walk({
      Link: (node) => { links.push(node.href ?? '') },
    })
    expect(links).toEqual(['https://example.com'])
  })

  it('visits CodeBlock nodes', () => {
    const result = parse('```js\nconsole.log("hi")\n```')
    const languages: string[] = []
    result.walk({
      CodeBlock: (node) => { languages.push(node.language) },
    })
    expect(languages).toEqual(['js'])
  })

  it('visits nodes in a multi-page document', () => {
    const result = parse('Page one\n\n---\n\nPage two')
    const texts: string[] = []
    result.walk({
      Text: (node) => { texts.push(node.value) },
    })
    expect(texts).toContain('Page one')
    expect(texts).toContain('Page two')
  })
})

// ─── pipeline() ───────────────────────────────────────────────────────────────

describe('pipeline()', () => {
  it('applies plugin visitors to the AST', () => {
    const upperPlugin: Plugin = {
      visitors: {
        Text: (node): Text => ({ ...node, value: node.value.toUpperCase() }),
      },
    }
    const enrichedParse = pipeline(parse, [upperPlugin])
    const result = enrichedParse('hello world')
    const texts: string[] = []
    result.walk({
      Text: (node) => { if(node)  texts.push(node.value) },
    })
    expect(texts).toEqual(['HELLO WORLD'])
  })

  it('applies plugins in order', () => {
    const appendA: Plugin = {
      visitors: {
        Text: (node): Text => ({ ...node, value: node.value + 'A' }),
      },
    }
    const appendB: Plugin = {
      visitors: {
        Text: (node): Text => ({ ...node, value: node.value + 'B' }),
      },
    }
    const enrichedParse = pipeline(parse, [appendA, appendB])
    const result = enrichedParse('x')
    const texts: string[] = []
    result.walk({
      Text: (node) => { if(node) texts.push(node.value) },
    })
    expect(texts).toEqual(['xAB'])
  })

  it('preserves ast and diagnostics on the result', () => {
    const enrichedParse = pipeline(parse, [])
    const result = enrichedParse('# Hello')
    expect(result.ast.type).toBe('Document')
    expect(Array.isArray(result.diagnostics)).toBe(true)
  })

  it('pipeline with no plugins returns correct parse', () => {
    const enrichedParse = pipeline(parse, [])
    const plain = parse('test')
    const enriched = enrichedParse('test')
    // Structural equality (different objects)
    expect(JSON.stringify(enriched.ast)).toEqual(JSON.stringify(plain.ast))
  })

  it('type-level: plugin with delta enriches node types', () => {
    // This test is primarily compile-time; we just verify runtime correctness
    interface EnrichedLink extends Link { resolved: boolean }

    const linkPlugin: Plugin<{ Link: EnrichedLink }> = {
      visitors: {
        Link: (node): EnrichedLink => ({ ...node, resolved: true }),
      },
    }
    const enrichedParse = pipeline(parse, [linkPlugin])
    const result = enrichedParse('[test](https://example.com)')

    // Walk with enriched type — collect resolved flags
    const resolved: boolean[] = []
    result.walk({
      Link: (node) => { resolved.push((node as EnrichedLink).resolved) },
    })
    expect(resolved).toEqual([true])
  })

  it('plugin visitors run exit-only (children before parent)', () => {
    const order: string[] = []
    const orderPlugin: Plugin = {
      visitors: {
        Text: () => { order.push('Text') },
        Paragraph: () => { order.push('Paragraph') },
      },
    }
    const enrichedParse = pipeline(parse, [orderPlugin])
    enrichedParse('hello')
    expect(order).toEqual(['Text', 'Paragraph'])
  })
})
