import { useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import type { BoardConfig, BundleInfo, TreeNode } from "@/api";
import { Rail, type RailSection } from "@/shell/Rail";
import { Breadcrumbs } from "@/shell/Breadcrumbs";
import { Tree } from "@/shell/Tree";
import { Omnibar } from "@/shell/Omnibar";
import { ScrollRestoration } from "@/shell/ScrollRestoration";
import { ThemeToggle } from "@/shell/Theme";
import { useBundleState } from "@/state";
import { NewBoard } from "@/views/NewBoard";

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
  children,
}: {
  bundle: BundleInfo;
  tree: TreeNode;
  /** Entries changed since they were last opened, marked wherever they appear. */
  unseen: Set<string>;
  children: ReactNode;
}) {
  const location = useLocation();
  /**
   * The last thing the rail was told, and where it was told.
   *
   * The section is the route's, derived rather than stored, so it changes in the
   * *same commit* the view does. Stored, it changed a frame earlier: the router
   * defers navigation into a transition while a `setState` here is urgent, so
   * clicking Boards collapsed the panel, reflowed the entry you were still
   * looking at, and only then swapped in the board.
   *
   * What is kept is only what the route cannot say: which section you picked
   * when there was nowhere to navigate, and whether the width change was a
   * toggle. Both are scoped to the location they happened at, so moving anywhere
   * forgets them without an effect having to run.
   */
  const [told, setTold] = useState<{ at: string; section?: RailSection; toggled?: boolean } | null>(
    null,
  );
  const here = told?.at === location.pathname ? told : null;
  const section = here?.section ?? sectionFor(location.pathname);
  const animate = here?.toggled ?? false;

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

  /**
   * Whether a section's panel is open, when nobody has said.
   *
   * The tree is worth its width beside whatever you are reading. A list of one
   * board is not a choice, so arriving at that board does not also spend width
   * on a chooser — but a list of several is exactly the thing you clicked for.
   */
  const openByDefault = (s: RailSection) =>
    s === "boards" ? (bundle.boards?.length ?? 0) > 1 : wideEnough;
  const panelOpen = openFor[section] ?? openByDefault(section);

  /** Opening or closing a panel, which is a thing you did and so animates. */
  const toggle = (s: RailSection, open: boolean) => {
    setTold({ at: location.pathname, section, toggled: true });
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
    // section and the route can disagree — picking Search leaves the route on
    // an entry — so this asks the route rather than trusting which icon looks
    // active.
    const showing =
      next === "entries"
        ? location.pathname.startsWith("/wiki")
        : next === "boards"
          ? location.pathname.startsWith("/kanban")
          : true;

    if (next === section && showing) {
      toggle(next, !panelOpen);
      return;
    }

    if (!showing) {
      const boards = bundle.boards ?? [];
      const target = boards.find((b) => b.id === lastBoard) ?? boards[0];
      if (next === "entries") {
        navigate(frontDoor(tree));
        return;
      }
      if (next === "boards" && target) {
        navigate(boardHref(target));
        return;
      }
    }

    // Nowhere to go, so the section is something this view shows rather than a
    // place: Search, which has no route, and Boards in a bundle that declares
    // none. There the panel is the whole of what the click can do — and an icon
    // that does nothing is the bug this rail has already had. It is also where
    // the first board gets declared, so it is where somebody with none needs to
    // end up.
    setTold({ at: location.pathname, section: next });
    setOpenFor((was) => ({ ...was, [next]: true }));
  };

  // The view area scrolls, not the document, so scroll restoration works from
  // this element rather than from the window.
  const viewRef = useRef<HTMLElement>(null);

  return (
    <div className="flex h-full flex-col">
      <header className="border-border bg-surface flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <button
          type="button"
          data-print="hide"
          aria-label={panelOpen ? "Hide navigation" : "Show navigation"}
          aria-expanded={panelOpen}
          onClick={() => toggle(section, !panelOpen)}
          className="text-muted hover:text-fg hover:bg-fg/5 grid size-8 shrink-0 place-items-center rounded-md"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>

        {/* Breadcrumbs shrink and ellipsize; the omnibar keeps a workable
            width. The path orients you, the omnibar moves you. */}
        <div className="min-w-0 flex-1">
          <Breadcrumbs bundleName={bundle.label} root={tree} path={path} />
        </div>

        <div data-print="hide" className="hidden w-full max-w-sm shrink justify-center sm:flex">
          <Omnibar tree={tree} unseen={unseen} />
        </div>

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
            "border-border bg-bg ml-14 shrink-0 overflow-y-auto border-r",
            animate ? "transition-[width] duration-200 ease-out" : "",
            panelOpen ? "w-64" : "w-0 border-r-0",
          ].join(" ")}
        >
          {panelOpen && section === "entries" && (
            <div className="py-2">
              <Tree node={tree} bundleId={bundle.id} unseen={unseen} />
            </div>
          )}
          {panelOpen && section === "boards" && (
            <Boards
              boards={bundle.boards}
              tree={tree}
              rootLabel={bundle.label}
              // Choosing from the list is done with the list, so it gives the
              // width back — and animates, because that close is something you
              // did rather than something that happened around you.
              onPick={(picked) => {
                setLastBoard(picked);
                toggle("boards", false);
              }}
            />
          )}
          {panelOpen && section === "search" && (
            <p className="text-muted p-3 text-sm">Search is not built yet.</p>
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

/** Which section a route belongs to. Search has no route, so it is never one. */
function sectionFor(pathname: string): RailSection {
  return pathname.startsWith("/kanban") ? "boards" : "entries";
}

/**
 * The boards a bundle declares, which is every board there is beyond `root`.
 */
function Boards({
  boards,
  tree,
  rootLabel,
  onPick,
}: {
  boards?: BoardConfig[];
  tree: TreeNode;
  rootLabel: string;
  onPick: (path: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  if (!boards?.length) return <NoBoards tree={tree} rootLabel={rootLabel} />;

  return (
    <>
    <ul className="p-2">
      {boards.map((b) => (
        <li key={b.path}>
          {/* Two lines, because a board's name and the folder it covers answer
              different questions and a one-line row makes you hover to get the
              second. There are rarely more than a handful of these, so the
              space is affordable. */}
          <NavLink
            to={boardHref(b)}
            onClick={() => onPick(b.id)}
            className={({ isActive }) =>
              [
                "block rounded-md px-2 py-1.5",
                isActive ? "bg-accent/10" : "hover:bg-fg/5",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={["block truncate text-sm", isActive ? "text-accent" : "text-fg"].join(
                    " ",
                  )}
                >
                  {b.name}
                </span>
                <span className="text-muted block truncate font-mono text-xs">{b.path}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>

    {/* Behind a disclosure, because the list is what you came for and a form
        under every one of them is a form you scroll past. Without it, adding a
        second board means editing wiki.toml by hand, which is the dead end the
        empty state already avoids. */}
    <div className="border-border border-t p-2">
      {adding ? (
        <div className="space-y-2 p-1">
          <NewBoard tree={tree} rootLabel={rootLabel} />
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
          + New board
        </button>
      )}
    </div>
    </>
  );
}

/**
 * What the Boards panel shows before there are any.
 *
 * The form rather than a paragraph about the form. The empty state of a feature
 * is the one moment somebody is definitely willing to be shown how it works, and
 * showing them is cheaper than explaining: a note about what to hand-write into
 * `wiki.toml` leaves them to go and do it, which is exactly the step this can
 * take for them.
 */
function NoBoards({ tree, rootLabel }: { tree: TreeNode; rootLabel: string }) {
  return (
    <div className="space-y-3 p-3">
      <p className="text-fg text-sm font-medium">Your first board</p>
      <p className="text-muted text-sm">
        A board is a folder's tasks, in columns by <code>status</code>.
      </p>
      <NewBoard tree={tree} rootLabel={rootLabel} />
    </div>
  );
}

/**
 * A board's address.
 *
 * The id rather than the path, because two boards can be over one folder and
 * only the id tells them apart.
 */
function boardHref(b: BoardConfig): string {
  return "/kanban/" + b.id;
}

/**
 * Where the reader opens: the bundle's own `index.md`, or the root listing when
 * it has none. The same front door the app opens on, so returning to Entries
 * from a board lands where starting fresh would.
 */
function frontDoor(tree: TreeNode): string {
  return tree.index ? "/wiki" + tree.index : "/wiki/";
}
