## 6. Block Interface

```
abstract Block
  No shared fields. A Block segment is any node that occupies a
  full line-level slot in the document.

  Pattern:
  - Container blocks carry `children: (Block | Inline)[]`
  - Leaf blocks carry no children
  - Attribute-carrying nodes carry `attributes: Attributes`

abstract Inline
  No shared fields. An Inline segment is any node parsed within
  inline content.

  Pattern:
  - Container inlines carry `children: Inline[]`
  - Leaf inlines carry no children
  - Most inline nodes carry `attributes: Attributes`
```

Note: Individual node definitions in §14 (AST Node Reference) list all fields explicitly. The abstract interfaces above describe the pattern only.

---
