import { expect, test } from "bun:test";
import type { Graph, GraphEdge } from "@/api";
import { neighbourhood, place, radius } from "@/views/graph";

function graph(nodes: string[], edges: [string, string, boolean?][]): Graph {
  return {
    path: "/people",
    id: "people",
    name: "People",
    neighbours: false,
    nodes: nodes.map((path) => ({ path, label: path })),
    edges: edges.map(([from, to, mutual]): GraphEdge => ({ from, to, mutual, via: ["body"], count: 1 })),
    fields: [],
  };
}

/** A first layout with every node put somewhere, the way the simulation would. */
function laidOut(g: Graph) {
  const first = place(g, null);
  first.nodes.forEach((n, i) => {
    n.x = 100 * (i + 1);
    n.y = -50 * (i + 1);
  });
  return first;
}

// The point of carrying anything: a refetch caused by some other file changing
// must redraw the same picture, not a fresh one.
test("a refetch of the same graph keeps every position and moves nothing", () => {
  const g = graph(["/a", "/b", "/c"], [["/a", "/b"]]);
  const before = laidOut(g);
  const after = place(graph(["/a", "/b", "/c"], [["/a", "/b"]]), before);

  expect(after.changed).toBe(false);
  expect(after.nodes.map((n) => [n.path, n.x, n.y])).toEqual(
    before.nodes.map((n) => [n.path, n.x, n.y]),
  );
});

test("a first layout is a change, and leaves placing to the simulation", () => {
  const first = place(graph(["/a"], []), null);
  expect(first.changed).toBe(true);
  expect(first.nodes[0]!.x).toBeUndefined();
});

// A newcomer arrives beside what it links to, rather than at the middle where a
// fresh layout starts — which would fling it across the graph to its place.
test("a new node starts beside the node it links to", () => {
  const before = laidOut(graph(["/a", "/b"], [["/a", "/b"]]));
  const after = place(graph(["/a", "/b", "/new"], [["/a", "/b"], ["/new", "/b"]]), before);

  expect(after.changed).toBe(true);
  const b = after.byPath.get("/b")!;
  const fresh = after.byPath.get("/new")!;
  expect(Math.hypot(fresh.x! - b.x!, fresh.y! - b.y!)).toBeLessThan(50);
  // Never exactly on it: two nodes at one point have no direction to part in.
  expect(fresh.x === b.x && fresh.y === b.y).toBe(false);
  // …and the same refetch places it the same way twice.
  const again = place(graph(["/a", "/b", "/new"], [["/a", "/b"], ["/new", "/b"]]), before);
  expect([again.byPath.get("/new")!.x, again.byPath.get("/new")!.y]).toEqual([fresh.x, fresh.y]);
});

test("a new node linked to nothing placed is left to the simulation", () => {
  const before = laidOut(graph(["/a"], []));
  const after = place(graph(["/a", "/lonely"], []), before);
  expect(after.byPath.get("/lonely")!.x).toBeUndefined();
});

test("an edge added, removed or turned mutual is a change; a node removed is too", () => {
  const before = laidOut(graph(["/a", "/b"], [["/a", "/b"]]));
  expect(place(graph(["/a", "/b"], []), before).changed).toBe(true);
  expect(place(graph(["/a", "/b"], [["/a", "/b", true]]), before).changed).toBe(true);
  expect(place(graph(["/a", "/b"], [["/b", "/a"]]), before).changed).toBe(true);

  const shrunk = place(graph(["/a"], []), before);
  expect(shrunk.changed).toBe(true);
  expect(shrunk.nodes.map((n) => n.path)).toEqual(["/a"]);
});

// A drag pins a node only while it lasts. A pin that survived into the next
// layout would hold that node still for good.
test("a pin is never carried into the next layout", () => {
  const before = laidOut(graph(["/a"], []));
  before.nodes[0]!.fx = 5;
  before.nodes[0]!.fy = 5;
  const after = place(graph(["/a"], []), before);
  expect(after.nodes[0]!.fx ?? null).toBeNull();
});

test("degree counts edges, and size grows with it but not without bound", () => {
  const g = place(graph(["/hub", "/a", "/b", "/lone"], [["/hub", "/a"], ["/b", "/hub", true]]), null);
  expect(g.nodes.map((n) => [n.path, n.degree])).toEqual([
    ["/hub", 2],
    ["/a", 1],
    ["/b", 1],
    ["/lone", 0],
  ]);
  expect(radius(0)).toBeLessThan(radius(1));
  expect(radius(10_000)).toBe(radius(1_000_000));
});

// Hovering lights what is one edge away, in either direction, and not two.
test("a neighbourhood is one edge out, both ways", () => {
  const g = place(graph(["/a", "/b", "/c", "/d"], [["/a", "/b"], ["/c", "/a"], ["/b", "/d"]]), null);
  expect([...neighbourhood(g.links, "/a")].sort()).toEqual(["/a", "/b", "/c"]);
});

// An edge naming a node that is not in the graph would stop the simulation
// outright. The server never sends one; this checks the client does not trust
// that with its life.
test("an edge to a node that is not there is dropped", () => {
  const g = place(graph(["/a"], [["/a", "/ghost"]]), null);
  expect(g.links).toEqual([]);
});
