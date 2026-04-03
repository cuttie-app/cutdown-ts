/**
 * Normalize raw input into an array of lines ready for block parsing.
 *
 * Steps per spec §2:
 *  1. Strip UTF-8 BOM
 *  2. Replace null bytes with U+FFFD
 *  3. Normalize line endings to \n; ensure trailing \n (spec §2.5)
 *  4. Replace tabs with a single space (outside fences — handled lazily here)
 *  5. Filter comment lines (first non-whitespace char is #)
 */
export function normalize(input: string): string[] {
  // 1. Strip BOM
  let s = input.startsWith('\uFEFF') ? input.slice(1) : input;

  // 2. Replace null bytes
  s = s.replace(/\0/g, '\uFFFD');

  // 3. Normalize line endings; append trailing \n if absent
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!s.endsWith('\n')) s += '\n';

  // 4. Replace tabs (globally — fence interiors are handled by their parsers)
  s = s.replace(/\t/g, ' ');

  // Split into lines
  const raw = s.split('\n');

  // 5. Filter comment lines (first non-whitespace char is #)
  //    "Invisible to block detection" means they are removed entirely,
  //    not replaced with blank lines.
  return raw.filter(line => {
    const trimmed = line.trimStart();
    return !trimmed.startsWith('#');
  });
}
