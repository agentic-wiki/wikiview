import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import type { Graph, GraphEdge, GraphNode } from "@/api";

/** A node as the layout moves it: the server's node, plus where it is. */
export interface Placed extends SimulationNodeDatum {
  node: GraphNode;
  path: string;
  degree: number;
}

export interface Joined extends SimulationLinkDatum<Placed> {
  edge: GraphEdge;
  source: Placed;
  target: Placed;
}

export interface Layout {
  byPath: Map<string, Placed>;
  nodes: Placed[];
  links: Joined[];
  /** The edges this layout was made from, to tell a new shape from the same. */
  shape: string;
  /** Whether the shape differs from the previous layout's, which is the only
   *  time anything should move. */
  changed: boolean;
}

/**
 * The graph's nodes and edges as the layout wants them, carrying over where the
 * previous layout left each node. Pass what this returned back in as `previous`
 * next time; `null` is a first layout.
 *
 * Carried over because the version moves on any change to any file: an agent
 * writing somewhere else refetches this graph, and laying it out afresh each time
 * would scramble it under you, and throw away a node you had dragged into place.
 * So a node that survives keeps its position, and a new one starts beside
 * whatever it is linked to rather than wherever a fresh layout would put it.
 */
export function place(graph: Graph, previous: Layout | null): Layout {
  const before = previous?.byPath ?? new Map<string, Placed>();

  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const byPath = new Map<string, Placed>();
  for (const node of graph.nodes) {
    const was = before.get(node.path);
    byPath.set(node.path, {
      node,
      path: node.path,
      degree: degree.get(node.path) ?? 0,
      // Position and velocity only. A node pinned by a drag was released when
      // the drag ended, so there is no pin to carry.
      ...(was && { x: was.x, y: was.y, vx: was.vx, vy: was.vy }),
    });
  }

  const links: Joined[] = [];
  for (const edge of graph.edges) {
    const source = byPath.get(edge.from);
    const target = byPath.get(edge.to);
    // The server only sends edges between nodes it sends. Checked anyway, since
    // a link to nothing would stop the layout rather than just drawing wrong.
    if (source && target) links.push({ edge, source, target });
  }

  // A newcomer starts next to a neighbour that already had a place, so it
  // arrives near where it will end up. One with no placed neighbour is left to
  // the layout's own start, which spirals out from the middle.
  for (const { source, target } of links) {
    for (const [fresh, anchor] of [
      [source, target],
      [target, source],
    ] as const) {
      if (fresh.x === undefined && anchor.x !== undefined && before.has(anchor.path)) {
        fresh.x = anchor.x + jitter(fresh.path);
        fresh.y = anchor.y! + jitter(fresh.path + "y");
      }
    }
  }

  const nodes = [...byPath.values()];
  const shape = edgeKey(graph.edges);
  const changed =
    previous === null ||
    nodes.length !== before.size ||
    nodes.some((n) => !before.has(n.path)) ||
    shape !== previous.shape;
  return { byPath, nodes, links, shape, changed };
}

function edgeKey(edges: GraphEdge[]): string {
  return edges.map((e) => e.from + "\n" + e.to + "\n" + (e.mutual ? 1 : 0)).join("\n\n");
}

/** A small offset, the same for the same path, so a newcomer never lands exactly
 *  on its anchor — two nodes at one point have no direction to be pushed apart
 *  in — and so the same refetch places it the same way twice. */
function jitter(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ((h % 1000) / 1000) * 30 || 15;
}

/** Nodes grow with how connected they are, gently: the sixth link matters less
 *  than the first. */
export function radius(degree: number): number {
  return Math.min(4 + Math.sqrt(degree) * 2.5, 16);
}

/** A node and everything one edge away, for lighting up what hovering one
 *  touches. */
export function neighbourhood(links: Joined[], path: string): Set<string> {
  const out = new Set([path]);
  for (const { source, target } of links) {
    if (source.path === path) out.add(target.path);
    if (target.path === path) out.add(source.path);
  }
  return out;
}

/**
 * Where a graph stops being drawable comfortably and starts being a hint that
 * the filter is too wide. A warning rather than a cap: everything is still
 * drawn, because a node silently left off is the one you were looking for.
 */
export const SOFT_LIMIT = 500;
