import { useEffect, useMemo, useRef, useState } from "react";
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
import { useBundle } from "@/bundle";
import { find } from "@/tree";
import { count } from "@/count";
import { groupColour, groupOf, groupsUnder, NEUTRAL, type Group } from "@/colour";
import { Glyph, IconButton } from "@/ui/IconButton";
import { SearchField } from "@/ui/SearchField";
import { usePeek } from "@/ui/peek";
import { State, StateIcon } from "@/ui/State";
import { SectionLabel } from "@/ui/SectionLabel";
import { Segmented } from "@/ui/Segmented";
import { SettingsButton } from "@/ui/SettingsButton";
import type { Queue } from "@/queue";
import { CardSheet, sheetHref } from "@/views/CardSheet";
import { GraphSettings } from "@/views/GraphSettings";
import { Loading } from "@/views/Loading";
import { NotFound } from "@/views/NotFound";
import {
  neighbourhood,
  place,
  radius,
  shorten,
  SOFT_LIMIT,
  TEXT_SIZES,
  type Joined,
  type Layout,
  type Placed,
  type TextSize,
} from "@/views/graph";

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
  const [storedSize, setTextSize] = useBundleState<TextSize>(bundleId, "graph-text", "m");
  // A stored value from some other version of this control is not a size.
  const textSize: TextSize = storedSize in TEXT_SIZES ? storedSize : "m";
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const { bundle, tree } = useBundle();
  // What to call the entries directly in the graph's own folder: that folder's
  // name, or the bundle's for a graph over the whole of it.
  const folder = find(tree, graph?.path ?? "/");
  const rootLabel =
    !graph || graph.path === "/" ? bundle.label : (folder && "children" in folder ? (folder.label ?? folder.name) : graph.path);
  const [highlight, setHighlight] = useState("");
  const [storedLabels, setLabels] = useBundleState<LabelMode>(bundleId, "graph-labels", "hubs");
  const labels: LabelMode = storedLabels === "all" || storedLabels === "none" ? storedLabels : "hubs";
  const [hidden, setHidden] = useBundleState<string[]>(bundleId, "graph:" + id + ":hidden", []);

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
      <header className="border-line flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-3.5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="text-fg truncate text-lg font-semibold tracking-tight">{graph.name}</h1>
          <span className="text-faint shrink-0 font-mono text-xs">
            {graph.path} · {count(graph.nodes.length, "entry", "entries")} · {count(graph.edges.length, "link", "links")}
          </span>
          {(graph.where ?? []).map((w) => (
            <code key={w} className="border-line text-muted shrink-0 rounded-md border px-1.5 font-mono text-[11px]">
              {w}
            </code>
          ))}
        </div>
        <div className="flex-1" />
        <div data-print="hide" className="flex flex-wrap items-center gap-2">
          <SearchField label="Highlight nodes" placeholder="Highlight nodes" value={highlight} onChange={setHighlight} />
          <span className="text-muted text-[12.5px]">Labels</span>
          <Segmented
            label="Labels"
            options={[
              ["hubs", "Hubs"],
              ["all", "All"],
              ["none", "None"],
            ]}
            value={labels}
            onChange={setLabels}
          />
          <div
            role="group"
            aria-label="Text size"
            className="bg-panel-2 border-line flex shrink-0 gap-0.5 rounded-[9px] border p-[3px] select-none"
          >
            {(Object.keys(TEXT_SIZES) as TextSize[]).map((size) => (
              <button
                key={size}
                type="button"
                title={TEXT_SIZES[size].label + " text"}
                aria-label={TEXT_SIZES[size].label + " text"}
                aria-pressed={textSize === size}
                onClick={() => setTextSize(size)}
                // The letter drawn at the size it stands for, so the three read
                // as a scale without a word each.
                style={{ fontSize: TEXT_SIZES[size].font - 1 }}
                className={[
                  "grid h-6.5 w-6.5 place-items-center rounded-md leading-none",
                  textSize === size ? "bg-elev text-fg" : "text-muted hover:text-fg",
                ].join(" ")}
              >
                A
              </button>
            ))}
          </div>
          <SettingsButton onClick={() => setEditing(true)} />
        </div>
      </header>

      {graph.nodes.length > SOFT_LIMIT && (
        <p role="status" className="border-line text-warn shrink-0 border-b px-4 py-1.5 text-xs">
          {graph.nodes.length} entries is more than a graph reads well. Narrowing <code>where</code> in
          wiki.toml would help — everything is still drawn.
        </p>
      )}

      {/* The sheet floats over this area, below the view's header, so the
          header's controls stay in reach while a card or node is open. */}
      <div className="relative flex min-h-0 min-w-0 grow">
        {graph.nodes.length === 0 ? (
          <div className="grow">
            <State
              icon={StateIcon.graph}
              title="Nothing on this graph"
              detail={
                <>
                  No entry under <code>{graph.path}</code>
                  {graph.where?.length ? " matches its filter" : ""}.
                </>
              }
            />
          </div>
        ) : (
          <Canvas
            graph={graph}
            textSize={textSize}
            labels={labels}
            highlight={highlight}
            groups={groupsUnder(tree, graph.path)}
            rootLabel={rootLabel}
            hidden={hidden}
            onHidden={setHidden}
            open={card}
            onOpen={(path) => navigate(sheetHref("/graph", id, path))}
            onBackground={() => card && navigate(closeTo, { replace: true })}
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
            hrefFor={(to) => sheetHref("/graph", id, to)}
            onClose={() => navigate(closeTo, { replace: true })}
          />
        )}
      </div>

      {editing && <GraphSettings graph={graph} onClose={() => setEditing(false)} />}

    </div>
  );
}

/** A pin: keeps a fold open. */
function PinGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
      <path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" />
    </svg>
  );
}

/** Where the view is looking: a pan in screen pixels, and a zoom. */
interface View {
  x: number;
  y: number;
  k: number;
}

/** Which nodes are named: the best connected, all, or none (the one pointed
 *  at, and the highlight's matches, always are). */
type LabelMode = "hubs" | "all" | "none";

/** At or under this many nodes, "hubs" names everything: a graph this small
 *  has no crowding for leaving names out to spare you. */
const SMALL_GRAPH = 24;

/** The legend key neighbours are grouped under: not a path, so no folder can
 *  share it. */
const NEIGHBOURS = "\u0000neighbours";

function Canvas({
  graph,
  textSize,
  labels,
  highlight,
  groups,
  rootLabel,
  hidden,
  onHidden,
  open,
  onOpen,
  onBackground,
}: {
  graph: Graph;
  textSize: TextSize;
  labels: LabelMode;
  /** Text to light the matching nodes by, "" for none. */
  highlight: string;
  /** The groups under the graph's folder, which colour its nodes. */
  groups: Group[];
  /** What the entries directly in the graph's folder are called in the legend. */
  rootLabel: string;
  /** Groups set aside, by path ("" for the rest): not drawn, still laid out. */
  hidden: string[];
  onHidden: (hidden: string[]) => void;
  /** The node open beside the graph, "" for none. */
  open: string;
  onOpen: (path: string) => void;
  /** A click on the canvas itself: a press that did not pan, and not on a node. */
  onBackground: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const layout = useRef<Layout | null>(null);
  const sim = useRef<Simulation<Placed, Joined> | null>(null);
  const [, redraw] = useState(0);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  // A legend row pointed at: its group lit, the rest dimmed, the way pointing
  // at a node lights its neighbours.
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  // The row just used to hide its group, until the pointer (or focus) leaves
  // it. Pointing at a hidden group previews it — but not the one you just
  // hid, which would reappear under the click that put it away.
  const [justHidden, setJustHidden] = useState<string | null>(null);
  // The legend folds to one line until it is pointed at or reached by keyboard,
  // so it does not sit over the graph when you are not using it. A click on
  // its header pins it open — kept per bundle — which is also how it opens on
  // a screen with no hover.
  const { bundle } = useBundle();
  const [pinned, setPinned] = useBundleState(bundle.id, "graph:legend", false);
  const legendPeek = usePeek();
  const legendOpen = pinned || legendPeek.peeking;

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
      if (r && r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height });
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
    | { kind: "pan"; x: number; y: number; from: { x: number; y: number }; moved: boolean }
    | null
  >(null);
  /** Set when a drag moved, so the click the browser sends after it does not
   *  also open the node. */
  const dragged = useRef(false);

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      g.moved ||= Math.hypot(e.clientX - g.from.x, e.clientY - g.from.y) >= 4;
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
    // A press on the canvas that did not pan is a click on nothing: the board's
    // "done with this one", here where pressing is also how you pan.
    if (g?.kind === "pan" && !g.moved) onBackground();
    if (g?.kind === "node") {
      // Let go rather than pinned, so the graph can settle around where you
      // dropped it and a refresh has no pin to carry.
      g.node.fx = null;
      g.node.fy = null;
      sim.current?.alphaTarget(0);
    }
  };

  const current = layout.current;

  /** A node's group, "" for anything outside the graph's groups. */
  // Neighbours are their own row: on the graph for context, from wherever in
  // the bundle, so no folder's name is theirs.
  const neighbours = new Set(graph.nodes.filter((n) => n.neighbour).map((n) => n.path));
  const groupKey = (path: string) =>
    neighbours.has(path) ? NEIGHBOURS : (groupOf(path, groups, graph.path)?.path ?? "");
  /** The group pointed at in the legend, hidden or not — except the one just
   *  hidden, which waits for the pointer to leave and come back. */
  const pointed = hoveredGroup !== null && hoveredGroup !== justHidden ? hoveredGroup : null;
  // Drawn unless set aside; a group set aside and pointed at is drawn for as
  // long as it is pointed at, as a preview. Nothing about `hidden` changes.
  const visible = (n: Placed) => {
    const key = groupKey(n.path);
    return !hidden.includes(key) || key === pointed;
  };

  // Hubs: the best-connected nodes, whose names are the landmarks a graph is
  // read by. A small graph has no crowding to spare you from, so every name.
  const hubFrom = useMemo(() => {
    const degrees = graph.nodes.length ? (current?.nodes ?? []).map((n) => n.degree).sort((a, b) => a - b) : [];
    return degrees[Math.floor(0.85 * (degrees.length - 1))] ?? 0;
  }, [current, graph.nodes.length]);
  const small = graph.nodes.length <= SMALL_GRAPH;

  // What the highlight matches, by what each node is called.
  const q = highlight.trim().toLowerCase();
  const matched = useMemo(() => {
    if (!q || !current) return null;
    return new Set(
      current.nodes.filter((n) => (n.node.title || n.node.label).toLowerCase().includes(q)).map((n) => n.path),
    );
  }, [q, current]);

  if (!current) {
    return <div className="relative min-h-0 grow"><svg ref={svg} className="absolute inset-0 size-full" /></div>;
  }

  const lit = hovered ? neighbourhood(current.links, hovered) : null;
  /** In the group pointed at in the legend; null when no group is. */
  const grouped = pointed === null ? null : (path: string) => groupKey(path) === pointed;
  // What stays at full strength: the hovered node and its neighbours, else the
  // hovered group, else the highlight's matches, else everything. What you are
  // pointing at wins over what you typed.
  const strong = (path: string) =>
    lit ? lit.has(path) : grouped ? grouped(path) : matched ? matched.has(path) : true;
  const { font, dot } = TEXT_SIZES[textSize];
  // Zoom moves nodes apart and never makes anything bigger: positions are
  // scaled here, and every size is in screen pixels. So zooming in makes room
  // between titles, which is what zooming in to read is for.
  const at = (n: Placed) => ({ x: (n.x ?? 0) * view.k, y: (n.y ?? 0) * view.k });
  const dotSize = (n: Placed) => radius(n.degree) * dot;
  const labelled = (n: Placed) =>
    (lit?.has(n.path) ?? false) ||
    (grouped?.(n.path) ?? false) ||
    (matched?.has(n.path) ?? false) ||
    labels === "all" ||
    (labels === "hubs" && (small || n.degree >= hubFrom || view.k > 1.8));
  const hoveredNode = hovered ? current.nodes.find((n) => n.path === hovered) : undefined;

  /** Zooms by a factor about the middle of the canvas. */
  const zoomBy = (f: number) =>
    setView((v) => {
      const k = Math.min(4, Math.max(0.2, v.k * f));
      return { k, x: (v.x / v.k) * k, y: (v.y / v.k) * k };
    });
  /** Frames every node that is drawn. */
  const fit = () => {
    const shown = current.nodes.filter(visible);
    if (shown.length === 0) return;
    const xs = shown.map((n) => n.x ?? 0);
    const ys = shown.map((n) => n.y ?? 0);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(4, Math.max(0.2, Math.min((box.w - 120) / (maxX - minX || 1), (box.h - 120) / (maxY - minY || 1))));
    setView({ k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k });
  };

  // The legend's rows, only those with a node on the graph: the entries
  // directly in the graph's folder first, under the folder's name — they are
  // what the folder itself holds — then each group under it, then neighbours.
  const counts = new Map<string, number>();
  for (const n of current.nodes) counts.set(groupKey(n.path), (counts.get(groupKey(n.path)) ?? 0) + 1);
  const legend: { key: string; label: string; colour: string; hollow?: boolean }[] = [
    ...(counts.has("") ? [{ key: "", label: rootLabel, colour: NEUTRAL }] : []),
    ...groups.filter((g) => counts.has(g.path)).map((g) => ({ key: g.path, label: g.label, colour: g.colour })),
    ...(counts.has(NEIGHBOURS) ? [{ key: NEIGHBOURS, label: "Neighbours", colour: NEUTRAL, hollow: true }] : []),
  ];
  const legendLabel = (path: string) => legend.find((l) => l.key === groupKey(path))?.label ?? rootLabel;

  return (
    <div
     
      className="relative min-h-0 grow"
      // The reference's dot grid: a ground to pan across, so movement reads.
      style={{
        backgroundImage: "radial-gradient(var(--color-line) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <svg
        ref={svg}
        role="img"
        aria-label={`${graph.name}: ${graph.nodes.length} entries`}
        className="absolute inset-0 size-full cursor-grab touch-none select-none"
        onPointerDown={(e) => {
          gesture.current = { kind: "pan", x: e.clientX, y: e.clientY, from: { x: e.clientX, y: e.clientY }, moved: false };
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <defs>
          {/* Which way a link points, drawn only on the edges of the node you
              are pointing at — the moment the question is asked. A notched
              dart rather than a plain triangle, so it reads as an arrow at
              this size. Sized in stroke widths, so it scales with its line,
              and filled like the lit edge it ends. */}
          <marker
            id="graph-arrow"
            viewBox="0 0 12 10"
            refX="12"
            refY="5"
            markerWidth="8"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0.5L12 5L0 9.5L3.5 5z" className="fill-fg/60" />
          </marker>
        </defs>
        <g transform={`translate(${box.w / 2 + view.x} ${box.h / 2 + view.y})`}>
          {current.links.map((l) => {
            if (!visible(l.source) || !visible(l.target)) return null;
            // The edges of the node you are pointing at, not every edge among
            // its neighbours: those say how they know each other, which you did
            // not ask.
            // Or, with a group pointed at, the edges inside it.
            const on =
              hovered !== null
                ? l.source.path === hovered || l.target.path === hovered
                : grouped !== null && grouped(l.source.path) && grouped(l.target.path);
            const faded =
              (lit !== null || grouped !== null || matched !== null) &&
              !on &&
              !(!lit && !grouped && matched?.has(l.source.path) && matched.has(l.target.path));
            // Direction only where you are looking: the hovered node's own edges.
            const arrowed = hovered !== null && on;
            const [x1, y1, x2, y2] = ends(at(l.source), at(l.target), dotSize(l.source), dotSize(l.target), arrowed);
            return (
              <g key={l.edge.from + "\n" + l.edge.to} opacity={faded ? 0.15 : 1}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  // Lit, but quieter than the text: at full strength the lit
                  // edges outshouted the nodes they join, in dark mode most.
                  className={on ? "stroke-fg/60" : "stroke-edge"}
                  strokeWidth={on ? 1.5 : 1}
                  markerEnd={arrowed ? "url(#graph-arrow)" : undefined}
                  markerStart={arrowed && l.edge.mutual ? "url(#graph-arrow)" : undefined}
                />
                {/* A wider line nobody sees, so an edge can be pointed at. */}
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={8}>
                  <title>{describe(l)}</title>
                </line>
              </g>
            );
          })}
          {current.nodes.map((n) => {
            if (!visible(n)) return null;
            const r = dotSize(n);
            const on = strong(n.path);
            const name = n.node.title || n.node.label;
            const p = at(n);
            const colour = groupColour(n.path, groups, graph.path);
            return (
              <g
                key={n.path}
                role="link"
                tabIndex={0}
                aria-label={name}
                data-path={n.path}
                data-neighbour={n.node.neighbour || undefined}
                transform={`translate(${p.x} ${p.y})`}
                opacity={on ? (n.node.neighbour ? 0.6 : 1) : 0.14}
                className="cursor-pointer outline-none transition-opacity"
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
                {/* A neighbour is hollow: on the graph for context, and not
                    what the graph is about. The one open beside the graph is
                    ringed, so it can be found again. */}
                <circle
                  r={r}
                  className={n.node.neighbour ? "fill-bg stroke-muted" : n.path === open ? "stroke-fg" : "stroke-bg"}
                  style={n.node.neighbour ? undefined : { fill: colour }}
                  strokeWidth={n.path === open ? 2.5 : 1.5}
                  strokeDasharray={n.node.neighbour ? "2 2" : undefined}
                />
                {/* Shortened until it is the one you are pointing at, which is
                    when the whole title is worth its width. Painted over a halo
                    of the ground, so it reads across the edges behind it. */}
                {labelled(n) && (
                  <text
                    y={r + font + 1}
                    textAnchor="middle"
                    fontSize={font}
                    className={on ? "fill-fg" : "fill-faint"}
                    fontWeight={n.path === hovered ? 600 : 400}
                    style={{ paintOrder: "stroke", stroke: "var(--color-bg)", strokeWidth: 3.5, pointerEvents: "none" }}
                  >
                    {n.path === hovered ? name : shorten(name)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Which part of the bundle each colour is, and a way to set one aside.
          On the canvas rather than in the panel, so it is there whenever the
          graph is — the panel is shut by default with one graph declared. */}
      {legend.length > 1 && (
        <div
          role="group"
          aria-label="Groups"
          data-print="hide"
          {...legendPeek.handlers}
          // Folded, the legend itself is what the keyboard reaches, and focus
          // opens it; open, its buttons are.
          tabIndex={legendOpen ? -1 : 0}
          className="bg-elev shadow-float focus-visible:outline-accent absolute top-4 left-4 flex max-h-[45%] w-52 flex-col overflow-y-auto rounded-[10px] p-1 outline-none focus-visible:outline-2"
        >
          <div className="flex h-8 items-center gap-2 pr-1 pl-2.5">
            <SectionLabel>Groups</SectionLabel>
            {legendOpen ? (
              <>
                <div className="flex-1" />
                {/* Everything back at once, whenever anything is set aside. */}
                {hidden.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onHidden([])}
                    className="text-faint hover:text-fg rounded-md px-1 text-[11px]"
                  >
                    show all
                  </button>
                )}
                {/* Keeps it open. Unpinned, it stays open while pointed at,
                    and folds once the pointer leaves, like any peek. */}
                <button
                  type="button"
                  aria-pressed={pinned}
                  aria-label={pinned ? "Let the groups fold" : "Keep the groups open"}
                  title={pinned ? "Let the groups fold" : "Keep the groups open"}
                  onClick={() => setPinned(!pinned)}
                  className={[
                    "hover:bg-fg/5 grid size-6 shrink-0 place-items-center rounded-md",
                    pinned ? "text-accent-ink" : "text-faint hover:text-fg",
                  ].join(" ")}
                >
                  <PinGlyph />
                </button>
              </>
            ) : (
              <>
                {/* Folded, the groups as their dots, so the fold still says
                    what the colours are, kept to the right, clear of the
                    label. Muted, since folded is out of the way and should not
                    compete with the graph; the ones set aside fainter still,
                    which is how the fold says some are hidden. Full colour is
                    for the open legend. Right-aligned only while they fit
                    (`safe`): with more groups than room, they start at the left
                    and the last are cut, never the first. */}
                <span className="ml-2 flex min-w-0 flex-1 items-center justify-end-safe gap-1 overflow-hidden pr-1.5" aria-hidden>
                  {legend.map((g) => (
                    <span
                      key={g.key || " root"}
                      className={[
                        "size-2 shrink-0 rounded-full",
                        g.hollow ? "border-faint border border-dashed" : "",
                        hidden.includes(g.key) ? "opacity-15" : "opacity-45",
                      ].join(" ")}
                      style={g.hollow ? undefined : { background: g.colour }}
                    />
                  ))}
                </span>
              </>
            )}
          </div>
          {legendOpen && legend.map((g) => {
            const off = hidden.includes(g.key);
            const others = legend.map((l) => l.key).filter((k) => k !== g.key);
            // The only group showing: its second button brings the rest back.
            const alone = !off && others.every((k) => hidden.includes(k));
            return (
              <div
                key={g.key || " other"}
                // Pointing at a row, or into it with the keyboard, lights its
                // group on the canvas.
                onPointerEnter={() => setHoveredGroup(g.key)}
                onPointerLeave={() => {
                  setHoveredGroup((h) => (h === g.key ? null : h));
                  setJustHidden((j) => (j === g.key ? null : j));
                }}
                onFocus={() => setHoveredGroup(g.key)}
                onBlur={() => {
                  setHoveredGroup((h) => (h === g.key ? null : h));
                  setJustHidden((j) => (j === g.key ? null : j));
                }}
                data-legend-row
                className="group/row hover:bg-fg/5 flex h-8 items-center rounded-[7px] pr-1"
              >
                <button
                  type="button"
                  aria-pressed={!off}
                  title={off ? "Show this group" : "Hide this group"}
                  onClick={() => {
                    if (!off) setJustHidden(g.key);
                    onHidden(off ? hidden.filter((h) => h !== g.key) : [...hidden, g.key]);
                  }}
                  className={["flex h-full min-w-0 flex-1 items-center gap-2.5 pl-2.5 text-left", off ? "opacity-40" : ""].join(" ")}
                >
                  {/* Neighbours are drawn hollow, so their row's dot is too. */}
                  <span
                    className={["size-2.5 shrink-0 rounded-full", g.hollow ? "border-faint border border-dashed" : ""].join(" ")}
                    style={g.hollow ? undefined : { background: g.colour }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{g.label}</span>
                </button>
                {/* Its count, which becomes the "show only" button on pointing
                    at the row, in the count's own place so the row does not grow.
                    While this is the only group showing, the button stays, lit,
                    and brings the rest back. */}
                <button
                  type="button"
                  aria-pressed={alone}
                  aria-label={alone ? "Show all groups" : `Show only ${g.label}`}
                  title={alone ? "Show all groups" : "Show only this group"}
                  onClick={() => onHidden(alone ? [] : others)}
                  className={[
                    "ml-1 grid h-6 min-w-6 shrink-0 place-items-center rounded-md px-1 hover:bg-fg/5",
                    alone ? "text-accent-ink" : "text-faint hover:text-fg",
                  ].join(" ")}
                >
                  {!alone && (
                    <span className="font-mono text-[11px] group-focus-within/row:hidden group-hover/row:hidden">
                      {counts.get(g.key)}
                    </span>
                  )}
                  <span className={alone ? "grid" : "hidden group-focus-within/row:grid group-hover/row:grid"}>
                    <Glyph size={13}>
                      <circle cx="12" cy="12" r="8" />
                      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                    </Glyph>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div data-print="hide" className="bg-elev shadow-float absolute bottom-4 left-4 flex flex-col gap-0.5 rounded-[10px] p-[3px]">
        <IconButton label="Zoom in" size="sm" onClick={() => zoomBy(1.25)}>
          <Glyph size={15}>
            <path d="M12 5v14M5 12h14" />
          </Glyph>
        </IconButton>
        <IconButton label="Zoom out" size="sm" onClick={() => zoomBy(1 / 1.25)}>
          <Glyph size={15}>
            <path d="M5 12h14" />
          </Glyph>
        </IconButton>
        <IconButton label="Fit the graph" size="sm" onClick={fit}>
          <Glyph size={14}>
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </Glyph>
        </IconButton>
      </div>

      {hoveredNode && (
        <div
          aria-hidden
          className="bg-elev shadow-float animate-wv-fade pointer-events-none absolute bottom-4 left-16 max-w-80 rounded-[10px] px-3.5 py-2.5"
        >
          <div className="text-faint mb-0.5 flex items-center gap-1.5 text-[11.5px]">
            <span
              className="size-[7px] rounded-full"
              style={{ background: groupColour(hoveredNode.path, groups, graph.path) }}
            />
            {legendLabel(hoveredNode.path)} · {count(hoveredNode.degree, "connection", "connections")}
          </div>
          <div className="font-semibold">{hoveredNode.node.title || hoveredNode.node.label}</div>
          <div className="text-faint mt-0.5 text-[11.5px]">Click to preview</div>
        </div>
      )}
    </div>
  );
}

/**
 * Where an edge's line starts and ends: at the edge of each circle rather than
 * its centre, so an arrowhead lands on the rim and is not hidden under the node.
 */
function ends(
  s: { x: number; y: number },
  t: { x: number; y: number },
  sr: number,
  tr: number,
  arrows: boolean,
): [number, number, number, number] {
  const d = Math.hypot(t.x - s.x, t.y - s.y) || 1;
  const ux = (t.x - s.x) / d;
  const uy = (t.y - s.y) / d;
  const gap = arrows ? 2 : 0;
  return [s.x + ux * (sr + gap), s.y + uy * (sr + gap), t.x - ux * (tr + gap), t.y - uy * (tr + gap)];
}

/** What an edge is, for pointing at it: which way, how it was written, how
 *  often. */
function describe(l: Joined): string {
  const name = (p: Placed) => p.node.title || p.node.label;
  const arrow = l.edge.mutual ? "↔" : "→";
  const times = l.edge.count > 1 ? ` · ${l.edge.count} links` : "";
  return `${name(l.source)} ${arrow} ${name(l.target)}\n${l.edge.via.join(", ")}${times}`;
}
