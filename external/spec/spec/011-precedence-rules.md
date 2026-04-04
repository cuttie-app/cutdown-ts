## 11. Precedence Rules

When multiple constructs compete for the same input, the following priority applies (highest first):

| Priority | Construct                                                             | Notes                                                     |
| -------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| 1        | Code fence ` ``` `                                                    | Content always literal                                    |
| 2        | Metadata fence `~~~`                                                  | Content always literal                                    |
| 3        | MathBlock `$$$`                                                       | Content always literal                                    |
| 4        | Inline code \`\` `CodeInline`                                         | Content literal                                           |
| 5        | Escape `\x`                                                           | Resolved before delimiter matching                        |
| 6        | Links and images `[...](...)`                                         | Matched before emphasis runs                              |
| 7        | Inline math `$$`                                                      | Matched before emphasis; content is literal               |
| 8        | Emphasis `**`, Strong `__`, Strikethrough `~~`, QuoteInline `""` `''` | Left-to-right greedy                                      |
| 9        | Named span `::name`                                                   | Matched after emphasis                                    |
| 10       | Variable `{{key}}` / Attributes `{...}`                               | Longest opener wins (`{{` before `{`), then left-to-right |

Note: MathInline content is always literal (no inline parsing). MathBlock content is always literal.

---
