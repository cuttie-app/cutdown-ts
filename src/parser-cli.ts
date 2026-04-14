import { parse } from './parser/index.ts'

// Input: positional arg, or stdin if piped / redirected
async function readInput(): Promise<string> {
  const arg = process.argv[2]
  if (arg !== undefined) return arg

  // stdin
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

const input = await readInput()
const { ast, diagnostics } = parse(input)

const output: Record<string, unknown> = { ast }
if (diagnostics.length > 0) output['diagnostics'] = diagnostics

process.stdout.write(JSON.stringify(output, null, 2) + '\n')
