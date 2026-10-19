import type { ReactNode } from 'react';

/**
 * The element tree satori accepts, as this repo's image generators build it.
 *
 * None of them use JSX — they hand satori plain `{ type, props }` objects,
 * which is the shape satori walks at runtime. Its signature, though, asks for
 * React's `ReactNode`, and a bare object literal is not one: it lacks `key`
 * and `$$typeof`, so TypeScript tries the `ReactPortal` overload and reports
 * the missing members. That was four of the type baseline's entries, one per
 * generator, plus an `as never` at the fifth call site.
 *
 * Declaring the shape means the literals are still checked — a `props` that is
 * not an object, or a child that is neither a node nor text, is still an error
 * — and the one unavoidable cast lives here, named, instead of four times in
 * four files.
 */
export interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriChild | SatoriChild[];
    [key: string]: unknown;
  };
}

/** `false`/`null` appear wherever a generator renders a section conditionally. */
export type SatoriChild = SatoriNode | string | number | false | null | undefined;

/** Hand a checked tree to satori. The cast is the point; see SatoriNode. */
export function satoriTree(node: SatoriNode): ReactNode {
  return node as unknown as ReactNode;
}
