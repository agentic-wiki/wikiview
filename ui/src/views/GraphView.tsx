import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import { api, type Graph } from "@/api";
import { useBundleState } from "@/state";
import type { Queue } from "@/queue";
import { CardSheet, sheetHref } from "@/views/CardSheet";
import { Loading } from "@/views/Loading";
import { NotFound } from "@/views/NotFound";
import { neighbourhood, place, radius, SOFT_LIMIT, type Joined, type Layout, type Placed } from "@/views/graph";

/**
 * A slice of the bundle as entries and the links between them.
 *
 * The graph arrives built: which entries are nodes and which links are edges is
 * decided by the server, where `where` is parsed and links are resolved. This
 * only lays it out and draws it. d3-force does the layout — nodes repel, edges
 * pull — and everything drawn is SVG here, so it looks like the rest of the app.
 */
export function GraphView({
  id,
  card,
  bundleId,
  changedAt,
  version,
  refresh,
  queue,
}: {
  id: string;
  /** The entry open over the graph, or "" for none. */
  card: string;
  /** Scopes the arrowheads preference, which is yours rather than the bundle's. */
  bundleId: string;
  changedAt: Record<string, number>;
  version: number;
  refresh: number;
  queue: Queue;
}) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrows, setArrows] = useBundleState(bundleId, "graph-arrows", false);
  const navigate = useNavigate();

  useEffect(() => {
    const ac = new AbortController();
    api
      .graph(id, ac.signal)
      .then((g) => {
        if (!ac.signal.aborted) {
          setGraph(g);
          setError(null);
        }
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(String(e.message ?? e));
      });
    return () => ac.abort();
  }, [id, refresh]);

  // A different graph is a different layout, and nothing of the last one's
  // positions means anything in it.
  const [shown, setShown] = useState(id);
  if (shown !== id) {
    setShown(id);
    setGraph(null);
  }

  if (error) return <NotFound path={"/graph/" + id} hint="There is no graph with that id" />;
  if (!graph || graph.id !== id) return <Loading />;

  const onGraph = new Set(graph.nodes.map((n) => n.path));
  const closeTo = "/graph/" + encodeURIComponent(id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-border flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <h1 className="text-fg truncate text-sm font-medium">{graph.name}</h1>
        <span className="text-muted shrink-0 font-mono text-xs">{graph.path}</span>
        {(graph.where ?? []).map((w) => (
          <code key={w} className="border-border text-muted shrink-0 rounded border px-1.5 text-xs">
            {w}
          </code>
        ))}
        <span className="text-muted ml-auto shrink-0 text-xs">
          {count(graph.nodes.length, "entry", "entries")} · {count(graph.edges.length, "link", "links")}
        </span>
        <label data-print="hide" className="text-muted flex shrink-0 items-center gap-1.5 text-xs">
          <input type="checkbox" checked={arrows} onChange={(e) => setArrows(e.target.checked)} />
          Direction
        </label>
      </header>

      {graph.nodes.length > SOFT_LIMIT && (
        <p role="status" className="border-border text-warn shrink-0 border-b px-4 py-1.5 text-xs">
          {graph.nodes.length} entries is more than a graph reads well. Narrowing <code>where</code> in
          wiki.toml would help — everything is still drawn.
        </p>
      )}

      {graph.nodes.length === 0 ? (
        <div className="text-muted grid grow place-items-center p-8 text-center text-sm">
          <p>
            No entry under <code>{graph.path}</code>
            {graph.where?.length ? " matches its filter" : ""}.
          </p>
        </div>
      ) : (
        <Canvas
          graph={graph}
          arrows={arrows}
          onOpen={(path) => navigate(sheetHref("/graph", id, path))}
        />
      )}

      {card && (
        <CardSheet
          path={card}
          version={version}
          refresh={refresh}
          changedAt={changedAt[card]}
          queue={queue}
          // A link to another node opens that node over the graph, the way a
          // link to another card does on a board. Anything else leaves for the
          // reader.
          destination={(to) => (onGraph.has(to) ? sheetHref("/graph", id, to) : "/wiki" + to)}
          onClose={() => navigate(closeTo, { replace: true })}
        />
      )}
    </div>
  );
}

/** Where the view is looking: a pan in screen pixels, and a zoom. */
interface View {
  x: number;
  y: number;
  k: number;
}

/** Past this zoom the labels are noise rather than names, so only the ones you
 *  are pointing at stay. */
const LABELS_FROM = 0.6;

function Canvas({
  graph,
  arrows,
  onOpen,
}: {
  graph: Graph;
  arrows: boolean;
  onOpen: (path: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const layout = useRef<Layout | null>(null);
  const sim = useRef<Simulation<Placed, Joined> | null>(null);
  const [, redraw] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);

  // One simulation for the life of the canvas. Its forces are settings rather
  // than data, so a refetch hands it new nodes and never a new simulation.
  useEffect(() => {
    const s = forceSimulation<Placed, Joined>()
      .force("charge", forceManyBody<Placed>().strength(-140))
      .force("link", forceLink<Placed, Joined>().distance(70))
      // Gentle pulls to the middle, without which an isolated node is pushed off
      // by every other one and never comes back.
      .force("x", forceX<Placed>(0).strength(0.05))
      .force("y", forceY<Placed>(0).strength(0.05))
      .force("collide", forceCollide<Placed>((n) => radius(n.degree) + 3))
      .on("tick", () => redraw((n) => n + 1));
    s.stop();
    sim.current = s;
    return () => {
      s.stop();
      sim.current = null;
    };
  }, []);

  // New data into the same simulation, keeping positions. Moved only when the
  // shape did: a refresh caused by a file elsewhere redraws the same picture.
  useEffect(() => {
    const s = sim.current;
    if (!s) return;
    const first = layout.current === null;
    const next = place(graph, layout.current);
    layout.current = next;
    s.nodes(next.nodes);
    s.force<ReturnType<typeof forceLink<Placed, Joined>>>("link")!.links(next.links);
    if (first) {
      // Most of the settling happens before the first paint, so a graph opens
      // close to its shape rather than exploding out of a spiral.
      s.alpha(1).tick(120);
      s.alpha(0.1).restart();
    } else if (next.changed) {
      s.alpha(0.3).restart();
    }
    redraw((n) => n + 1);
  }, [graph]);

  // The canvas is the view area's size, so one graph unit is one pixel at 1×.
  useEffect(() => {
    const measure = () => {
      const r = svg.current?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // A graph point under a screen point, which a drag needs to pin a node where
  // the pointer is.
  const toGraph = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: (clientX - r.left - r.width / 2 - view.x) / view.k,
      y: (clientY - r.top - r.height / 2 - view.y) / view.k,
    };
  };

  // Zooming around the pointer, so what you aimed at stays under it. Listened
  // for natively because React's wheel listener is passive, and a passive one
  // cannot stop the page scrolling underneath.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      setView((v) => {
        const k = Math.min(4, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /** What the pointer is doing: dragging a node, panning, or nothing. */
  const gesture = useRef<
    | { kind: "node"; node: Placed; x: number; y: number; moved: boolean }
    | { kind: "pan"; x: number; y: number }
    | null
  >(null);
  /** Set when a drag moved, so the click the browser sends after it does not
   *  also open the node. */
  const dragged = useRef(false);

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      g.x = e.clientX;
      g.y = e.clientY;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
    g.moved = dragged.current = true;
    const p = toGraph(e.clientX, e.clientY);
    g.node.fx = p.x;
    g.node.fy = p.y;
    sim.current?.alphaTarget(0.3).restart();
  };

  const endGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === "node") {
      // Let go rather than pinned, so the graph can settle around where you
      // dropped it and a refresh has no pin to carry.
      g.node.fx = null;
      g.node.fy = null;
      sim.current?.alphaTarget(0);
    }
  };

  const current = layout.current;
  if (!current) return <svg ref={svg} className="bg-sunken min-h-0 grow" />;

  const lit = hovered ? neighbourhood(current.links, hovered) : null;
  const labels = view.k >= LABELS_FROM;

  return (
    <svg
      ref={svg}
      role="img"
      aria-label={`${graph.name}: ${graph.nodes.length} entries`}
      className="bg-sunken min-h-0 grow cursor-grab touch-none select-none"
      onPointerDown={(e) => {
        gesture.current = { kind: "pan", x: e.clientX, y: e.clientY };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <defs>
        {/* Sized in stroke widths, so it scales with the line it ends. */}
        <marker
          id="graph-arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" className="fill-muted" />
        </marker>
      </defs>
      <g transform={`translate(${size.w / 2 + view.x} ${size.h / 2 + view.y}) scale(${view.k})`}>
        {current.links.map((l) => {
          // The edges of the node you are pointing at, not every edge among its
          // neighbours: those say how they know each other, which you did not ask.
          const on = hovered !== null && (l.source.path === hovered || l.target.path === hovered);
          const [x1, y1, x2, y2] = ends(l, arrows);
          return (
            <g key={l.edge.from + "\n" + l.edge.to} opacity={lit && !on ? 0.15 : 1}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className={on ? "stroke-accent" : "stroke-muted/50"}
                strokeWidth={on ? 1.5 : 1}
                markerEnd={arrows ? "url(#graph-arrow)" : undefined}
                markerStart={arrows && l.edge.mutual ? "url(#graph-arrow)" : undefined}
              />
              {/* A wider line nobody sees, so an edge can be pointed at. */}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={8}>
                <title>{describe(l)}</title>
              </line>
            </g>
          );
        })}
        {current.nodes.map((n) => {
          const r = radius(n.degree);
          const on = lit?.has(n.path) ?? false;
          const name = n.node.title || n.node.label;
          return (
            <g
              key={n.path}
              role="link"
              tabIndex={0}
              aria-label={name}
              data-path={n.path}
              data-neighbour={n.node.neighbour || undefined}
              transform={`translate(${n.x ?? 0} ${n.y ?? 0})`}
              opacity={lit && !on ? 0.25 : n.node.neighbour ? 0.6 : 1}
              className="cursor-pointer outline-none"
              onPointerDown={(e) => {
                e.stopPropagation();
                dragged.current = false;
                gesture.current = { kind: "node", node: n, x: e.clientX, y: e.clientY, moved: false };
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
              }}
              onPointerEnter={() => setHovered(n.path)}
              onPointerLeave={() => setHovered((h) => (h === n.path ? null : h))}
              onFocus={() => setHovered(n.path)}
              onBlur={() => setHovered((h) => (h === n.path ? null : h))}
              onClick={() => {
                if (!dragged.current) onOpen(n.path);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(n.path);
                }
              }}
            >
              <title>{n.path}</title>
              {/* A neighbour is hollow: on the graph for context, and not what
                  the graph is about. */}
              <circle
                r={r}
                className={
                  n.node.neighbour
                    ? "fill-bg stroke-muted"
                    : on
                      ? "fill-accent stroke-accent"
                      : "fill-muted stroke-surface"
                }
                strokeWidth={1.5}
                strokeDasharray={n.node.neighbour ? "2 2" : undefined}
              />
              {(labels || on) && (
                <text y={r + 11} textAnchor="middle" fontSize={10} className={on ? "fill-fg" : "fill-muted"}>
                  {name}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/**
 * Where an edge's line starts and ends: at the edge of each circle rather than
 * its centre, so an arrowhead lands on the rim and is not hidden under the node.
 */
function ends(l: Joined, arrows: boolean): [number, number, number, number] {
  const sx = l.source.x ?? 0;
  const sy = l.source.y ?? 0;
  const tx = l.target.x ?? 0;
  const ty = l.target.y ?? 0;
  const d = Math.hypot(tx - sx, ty - sy) || 1;
  const ux = (tx - sx) / d;
  const uy = (ty - sy) / d;
  const gap = arrows ? 2 : 0;
  const rs = radius(l.source.degree) + gap;
  const rt = radius(l.target.degree) + gap;
  return [sx + ux * rs, sy + uy * rs, tx - ux * rt, ty - uy * rt];
}

/** What an edge is, for pointing at it: which way, how it was written, how
 *  often. */
function describe(l: Joined): string {
  const name = (p: Placed) => p.node.title || p.node.label;
  const arrow = l.edge.mutual ? "↔" : "→";
  const times = l.edge.count > 1 ? ` · ${l.edge.count} links` : "";
  return `${name(l.source)} ${arrow} ${name(l.target)}\n${l.edge.via.join(", ")}${times}`;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
