import { useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import type { BundleInfo, TreeNode } from "@/api";
import { Rail, type RailSection } from "@/shell/Rail";
import { Breadcrumbs, readerCrumbs, type Crumb } from "@/shell/Breadcrumbs";
import { Tree } from "@/shell/Tree";
import { Omnibar } from "@/shell/Omnibar";
import { DocumentTitle } from "@/shell/DocumentTitle";
import { ScrollRestoration } from "@/shell/ScrollRestoration";
import { ThemeToggle } from "@/shell/Theme";
import { useBundleState } from "@/state";
import { GitActions } from "@/shell/GitActions";
import { NewView } from "@/views/NewView";
import { frontDoor } from "@/tree";

/**
 * The chrome every view sits inside: a rail, a collapsible panel, a breadcrumb
 * header, and the view area.
 *
 * One layout rather than a preference. Breadcrumbs, a panel and a palette are
 * affordances that compose rather than alternatives that compete, and two
 * selectable layouts would mean two sets of states, two responsive behaviours,
 * and every future view built twice.
 */
export function Shell({
  bundle,
  tree,
  unseen,
  saved,
  refresh,
  children,
}: {
  bundle: BundleInfo;
  tree: TreeNode;
  /** Moves when the server reports new content, so the git status re-reads: a
   *  commit somebody else made changes what a sync would carry. */
  refresh: number;
  /** Entries changed since they were last opened, marked wherever they appear. */
  unseen: Set<string>;
  /** The entries you saved to read later, marked in the tree so the list is not
   *  the only place they exist. */
  saved: Set<string>;
  children: ReactNode;
}) {
  const location = useLocation();
  /**
   * The section you picked, and the part of the app you picked it in.
   *
   * Normally the section is the route's, derived rather than stored, so it
   * changes in the *same commit* the view does. Stored, it changed a frame
   * earlier: the router defers navigation into a transition while a `setState`
   * here is urgent, so clicking Boards collapsed the panel, reflowed the entry
   * you were still looking at, and only then swapped in the board.
   *
   * What has to be kept is the one thing a route cannot say: which section you
   * picked when there was nowhere to navigate. Boards in a bundle that declares
   * none is that case — the panel is where the first one gets written.
   *
   * Kept per *family* of routes rather than per URL, so it survives moving around
   * inside the part of the app you picked it in. Scoped to the pathname, as it
   * was, the panel went away on the first entry you opened from it.
   *
   * A pick that navigates clears it, so arriving somewhere hands the section back
   * to the route: clicking Entries means the tree, not whatever panel you last
   * had over the reader.
   */
  const [picked, setPicked] = useState<{ family: RailSection; section: RailSection } | null>(null);
  const family = sectionFor(location.pathname);
  const section = picked?.family === family ? picked.section : family;

  /** Whether a width change animates: it does when you caused it, and not when
   *  arriving somewhere whose panel is a different size. Scoped to the URL it
   *  happened at, so nothing has to clear it. */
  const [toggledAt, setToggledAt] = useState<string | null>(null);
  const animate = toggledAt === location.pathname;

  // What the panel is doing, per section, and only where it has been said. Each
  // section's list is a different thing to want beside your work — the tree
  // earns its width, a list of one board does not — so one shared flag meant
  // switching section argued with what you last did to the panel you left.
  const [openFor, setOpenFor] = useState<Partial<Record<RailSection, boolean>>>({});
  const navigate = useNavigate();
  // Only a reader route has a bundle path in it. On a board the pathname is an
  // id, and treating it as a path built links like `/wiki/kanban` — a trail
  // through folders that do not exist.
  const path = location.pathname.startsWith("/wiki")
    ? location.pathname.replace(/^\/wiki\/?/, "")
    : "";
  // The board you were last on, so the rail returns you to it rather than to
  // whichever one happens to be declared first. A view preference, so it is
  // scoped to this bundle like the rest.
  const [lastBoard, setLastBoard] = useBundleState(bundle.id, "board", "");
  const [lastGraph, setLastGraph] = useBundleState(bundle.id, "graph", "");

  /**
   * Whether a section's panel is open, when nobody has said.
   *
   * The tree is worth its width beside whatever you are reading. A list of one
   * board is not a choice, so arriving at that board does not also spend width
   * on a chooser — but a list of several is exactly the thing you clicked for.
   */
  const openByDefault = (s: RailSection) =>
    s === "boards"
      ? (bundle.boards?.length ?? 0) > 1
      : s === "graphs"
        ? (bundle.graphs?.length ?? 0) > 1
        : wideEnough;
  const panelOpen = hasPanel(section) && (openFor[section] ?? openByDefault(section));

  /** Opening or closing a panel, which is a thing you did and so animates. */
  const toggle = (s: RailSection, open: boolean) => {
    setToggledAt(location.pathname);
    setOpenFor((was) => ({ ...was, [s]: open }));
  };

  /**
   * Clicking a rail icon.
   *
   * Two things, decided separately: an icon you are not on takes you there, and
   * the icon you are on toggles its panel. Tangling them is how this rail has
   * already been wrong twice — once by collapsing the panel and leaving the
   * hamburger as the only way back, once by taking a shortcut past a navigation
   * it owed you because the icon was already the active one.
   *
   * Navigating is the *whole* of what a click does when there is somewhere to
   * go. Nothing here touches the section or the panel in that case, because the
   * route already says both and saying them twice is what put them a frame
   * apart.
   */
  const pick = (next: RailSection) => {
    // Whether the route is already showing this section's kind of thing. The
    // section and the route can disagree — a bundle with no boards picks Boards
    // while the route stays on an entry — so this asks the route rather than
    // trusting which icon looks active.
    const prefix = PREFIX[next];
    const showing = prefix === undefined || location.pathname.startsWith(prefix);

    if (next === section && showing) {
      // A section with no panel has nothing left for a second click to do: you
      // are already looking at the page it names.
      if (hasPanel(next)) toggle(next, !panelOpen);
      return;
    }

    if (!showing) {
      const to =
        next === "entries"
          ? frontDoor(tree) // the bundle's own front door, not the prefix
          : next === "boards"
            ? returnTo("/kanban", bundle.boards, lastBoard)
            : next === "graphs"
              ? returnTo("/graph", bundle.graphs, lastGraph)
              : PREFIX[next];
      if (to) {
        // Going somewhere hands the section back to the route, so a panel picked
        // over the last view does not follow you into this one.
        setPicked(null);
        navigate(to);
        return;
      }
    }

    // Nowhere to go, so the section is something this view shows rather than a
    // place: Boards in a bundle that declares none of them. There the panel is
    // the whole of what the click can do — and an icon that does nothing is the
    // bug this rail has already had. It is also where the first board gets
    // declared, so it is where somebody with none needs to end up.
    setPicked({ family, section: next });
    setOpenFor((was) => ({ ...was, [next]: true }));
  };

  const crumbs = trail(location.pathname, path, tree, bundle, (s) => toggle(s, true));

  // The view area scrolls, not the document, so scroll restoration works from
  // this element rather than from the window.
  const viewRef = useRef<HTMLElement>(null);

  return (
    <div className="flex h-full flex-col">
      <DocumentTitle bundle={bundle} tree={tree} />
      {/* No panel toggle of its own: clicking the rail's active icon is that
          control, and a hamburger beside it was a second way to do one thing —
          the vaguer of the two, since it could only ever mean "whichever panel
          is showing" while the icon names the section it hides. */}
      <header className="border-line bg-panel relative z-10 flex h-13 shrink-0 items-center gap-2.5 border-b pr-3 pl-2.5">
        {/* The bundle, named once: the tile and the label are one link to the
            front door, and the trail beside it starts inside the bundle. */}
        <Link
          to={frontDoor(tree)}
          title="Go to the bundle's front door"
          className="hover:bg-fg/5 flex shrink-0 items-center gap-2.5 rounded-lg py-1 pr-2 pl-1"
        >
          <span
            aria-hidden
            className="bg-accent text-on-accent grid size-6.5 place-items-center rounded-[7px] text-[13px] font-bold tracking-tight"
          >
            {initial(bundle.label)}
          </span>
          <span className="font-semibold tracking-tight whitespace-nowrap">{bundle.label}</span>
        </Link>

        {/* The trail shrinks and ellipsizes; the search trigger keeps a workable
            width. The path orients you, the search moves you. */}
        <div className="min-w-0 flex-1">
          <Breadcrumbs crumbs={crumbs} />
        </div>

        <div data-print="hide" className="hidden shrink sm:flex">
          <Omnibar tree={tree} unseen={unseen} />
        </div>

        <GitActions refresh={refresh} />

        <span data-print="hide">
          <ThemeToggle />
        </span>
      </header>

      <div className="relative flex min-h-0 grow">
        <Rail active={section} onSelect={pick} />

        {/* Offset by the rail's collapsed width; the rail expands over this
            rather than pushing it, so nothing here reflows. */}
        <aside
          data-print="hide"
          className={[
            "border-line bg-panel ml-14 shrink-0 overflow-y-auto border-r",
            animate ? "transition-[width] duration-200 ease-out" : "",
            panelOpen ? "w-64" : "w-0 border-r-0",
          ].join(" ")}
        >
          {panelOpen && section === "entries" && (
            <div className="py-2">
              <Tree node={tree} bundleId={bundle.id} unseen={unseen} saved={saved} />
            </div>
          )}
          {panelOpen && section === "boards" && (
            <ViewsPanel
              kind="board"
              views={bundle.boards}
              tree={tree}
              rootLabel={bundle.label}
              intro={
                <>
                  A board is a folder's tasks, in columns by <code>status</code>.
                </>
              }
              // Choosing from the list is done with the list, so it gives the
              // width back — and animates, because that close is something you
              // did rather than something that happened around you.
              onPick={(picked) => {
                setLastBoard(picked);
                toggle("boards", false);
              }}
            />
          )}
          {panelOpen && section === "graphs" && (
            <ViewsPanel
              kind="graph"
              views={bundle.graphs}
              tree={tree}
              rootLabel={bundle.label}
              intro="A graph is a folder's entries and the links between them. Narrow it with a filter afterwards, in its settings."
              onPick={(picked) => {
                setLastGraph(picked);
                toggle("graphs", false);
              }}
            />
          )}
        </aside>

        <main ref={viewRef} className="min-w-0 grow overflow-y-auto">
          <ScrollRestoration containerRef={viewRef} />
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Whether there is room for a panel beside the work.
 *
 * Read once, at load: boards and grids need width, and this is a working tool on
 * a wide screen before it is a phone app.
 */
const wideEnough = window.innerWidth >= 768;

/**
 * The route prefix each section owns.
 *
 * Every section is a place, so every icon takes you somewhere. One table rather
 * than a chain of `startsWith` in two functions, which is how a section ends up
 * navigable from the rail and unrecognised by the route.
 */
const PREFIX: Partial<Record<RailSection, string>> = {
  entries: "/wiki",
  boards: "/kanban",
  graphs: "/graph",
  changed: "/changed",
  later: "/read-later",
};

/** Which section a route belongs to; the reader for anything unclaimed. */
function sectionFor(pathname: string): RailSection {
  for (const [id, prefix] of Object.entries(PREFIX)) {
    if (pathname.startsWith(prefix)) return id as RailSection;
  }
  return "entries";
}

/**
 * Whether a section has anything to put beside the view.
 *
 * The tree and the list of boards are structures you steer with *while* reading,
 * so they earn a column. The two lists are pages: you go to them when you are
 * choosing what to read next, and one of them could not be a panel at all —
 * opening a changed entry marks it seen, so the row leaves the list, and beside
 * your work that is a handle vanishing from under the cursor with the next click
 * landing on something you did not aim at.
 */
function hasPanel(section: RailSection): boolean {
  return section === "entries" || section === "boards" || section === "graphs";
}

/**
 * The views of one kind a bundle declares, and the way to declare another.
 *
 * With none declared the form is the whole panel. The empty state of a feature
 * is the one moment somebody is definitely willing to be shown how it works, and
 * showing them is cheaper than explaining: a note about what to hand-write into
 * `wiki.toml` leaves them to go and do it, which is exactly the step this can
 * take for them.
 */
function ViewsPanel({
  kind,
  views,
  tree,
  rootLabel,
  intro,
  onPick,
}: {
  kind: "board" | "graph";
  views?: Declared[];
  tree: TreeNode;
  rootLabel: string;
  /** What this kind of view is, said once, where the first one is made. */
  intro: ReactNode;
  onPick: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  if (!views?.length) {
    return (
      <div className="space-y-3 p-3">
        <p className="text-fg text-sm font-medium">Your first {kind}</p>
        <p className="text-muted text-sm">{intro}</p>
        <NewView kind={kind} tree={tree} rootLabel={rootLabel} />
      </div>
    );
  }

  return (
    <>
      <ViewList prefix={kind === "board" ? "/kanban" : "/graph"} views={views} onPick={onPick} />

      {/* Behind a disclosure, because the list is what you came for and a form
          under every one of them is a form you scroll past. Without it, adding a
          second one means editing wiki.toml by hand, which is the dead end the
          empty state already avoids. */}
      <div className="border-line border-t p-2">
        {adding ? (
          <div className="space-y-2 p-1">
            <NewView kind={kind} tree={tree} rootLabel={rootLabel} />
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-muted hover:text-fg w-full text-xs"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-muted hover:text-fg hover:bg-fg/5 w-full rounded-md px-2 py-1.5 text-left text-sm"
          >
            + New {kind}
          </button>
        )}
      </div>
    </>
  );
}

/** A declared view over a folder: a board or a graph. */
type Declared = { id: string; name: string; path: string };

/**
 * The declared views of one kind, as the panel lists them.
 *
 * Addressed by id rather than path, because two views can be over one folder
 * and only the id tells them apart.
 */
function ViewList({
  prefix,
  views,
  onPick,
}: {
  prefix: string;
  views: Declared[];
  onPick: (id: string) => void;
}) {
  return (
    <ul className="p-2">
      {views.map((v) => (
        <li key={v.id}>
          {/* Two lines, because a view's name and the folder it covers answer
              different questions and a one-line row makes you hover to get the
              second. There are rarely more than a handful of these, so the
              space is affordable. */}
          <NavLink
            to={prefix + "/" + encodeURIComponent(v.id)}
            onClick={() => onPick(v.id)}
            className={({ isActive }) =>
              ["block rounded-md px-2 py-1.5", isActive ? "bg-accent-bg" : "hover:bg-fg/5"].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span className={["block truncate text-sm", isActive ? "text-accent-ink" : "text-fg"].join(" ")}>
                  {v.name}
                </span>
                <span className="text-faint block truncate font-mono text-xs">{v.path}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * Where a rail icon returns you to: the view you were last on, or the first one
 * declared. Nothing when none is, which leaves the click to open the panel.
 */
function returnTo(prefix: string, views: Declared[] | undefined, last: string): string | undefined {
  const target = views?.find((v) => v.id === last) ?? views?.[0];
  return target && prefix + "/" + encodeURIComponent(target.id);
}

/** The letter in the logo tile: the bundle label's first character. */
function initial(label: string): string {
  return (label.trim()[0] ?? "·").toUpperCase();
}

/**
 * The header's trail for a route.
 *
 * The reader walks the bundle path. A board or a graph is addressed by an id, so
 * its trail is the section and the view's name, and the section crumb opens its
 * panel — the list of the others — rather than going anywhere. The two lists are
 * pages of the app with nothing above them.
 */
function trail(
  pathname: string,
  path: string,
  tree: TreeNode,
  bundle: BundleInfo,
  openPanel: (s: RailSection) => void,
): Crumb[] {
  const view = (section: "boards" | "graphs", prefix: string, views?: Declared[]): Crumb[] => {
    const id = decodeURIComponent(pathname.slice(prefix.length + 1).split("/")[0] ?? "");
    const name = views?.find((v) => v.id === id)?.name ?? id;
    return [{ label: section === "boards" ? "Boards" : "Graphs", onClick: () => openPanel(section) }, { label: name }];
  };
  switch (sectionFor(pathname)) {
    case "boards":
      return view("boards", "/kanban", bundle.boards);
    case "graphs":
      return view("graphs", "/graph", bundle.graphs);
    case "changed":
      return [{ label: "Recently changed" }];
    case "later":
      return [{ label: "Read later" }];
    default:
      return readerCrumbs(tree, path);
  }
}
