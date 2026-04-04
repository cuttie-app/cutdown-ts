import type { NodeMap } from '../types/document/node-map.ts'

// ─── Plugin delta ─────────────────────────────────────────────────────────────

/**
 * A partial map over NodeMap that a plugin can override.
 * Keys must be existing NodeMap keys; values replace the node type.
 */
export type PluginDelta = Partial<NodeMap>

/**
 * Apply a single PluginDelta to a map, replacing entries where the delta
 * provides a new type.
 */
export type ApplyDelta<TMap extends Record<string, unknown>, TDelta extends Partial<TMap>> = {
  [K in keyof TMap]: K extends keyof TDelta ? TDelta[K] : TMap[K]
}

/**
 * Fold a tuple of PluginDeltas left-to-right into TMap.
 * `Apply<NodeMap, [P1, P2]>` = `ApplyDelta<ApplyDelta<NodeMap, P1>, P2>`
 */
export type Apply<
  TMap extends Record<string, unknown>,
  TPlugins extends readonly PluginDelta[],
> = TPlugins extends readonly [infer Head, ...infer Tail]
  ? Head extends Partial<TMap>
    ? Tail extends readonly PluginDelta[]
      ? Apply<ApplyDelta<TMap, Head>, Tail>
      : ApplyDelta<TMap, Head>
    : Apply<TMap, Tail extends readonly PluginDelta[] ? Tail : never>
  : TMap

// ─── Visitor types ────────────────────────────────────────────────────────────

/**
 * A single exit-visitor: receives the node and may return a replacement.
 * Returning `undefined` (or void) means "keep node as-is".
 */
export type Visitor<TNode> = (node: TNode) => TNode | void

/**
 * Map of optional visitors keyed by node type name, over an enriched NodeMap.
 */
export type Visitors<TMap extends Record<string, unknown>> = {
  [K in keyof TMap]?: Visitor<TMap[K]>
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

/**
 * A plugin contributes:
 *  - `delta`: the type-level overrides it introduces
 *  - `visitors`: runtime transformations run as exit-visitors
 *
 * The `delta` field is type-only (never read at runtime).
 */
export interface Plugin<TDelta extends PluginDelta = PluginDelta> {
  readonly delta?: TDelta
  readonly visitors: Visitors<NodeMap>
}
