import { useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import type { BoardConfig, BundleInfo, TreeNode } from "@/api";
import { Rail, type RailSection } from "@/shell/Rail";
import { Breadcrumbs } from "@/shell/Breadcrumbs";
import { Tree } from "@/shell/Tree";
import { Omnibar } from "@/shell/Omnibar";
import { DocumentTitle } from "@/shell/DocumentTitle";
import { ScrollRestoration } from "@/shell/ScrollRestoration";
import { ThemeToggle } from "@/shell/Theme";
import { useBundleState } from "@/state";
import { GitActions } from "@/shell/GitActions";
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

  /**
   * Whether a section's panel is open, when nobody has said.
   *
   * The tree is worth its width beside whatever you are reading. A list of one
   * board is not a choice, so arriving at that board does not also spend width
   * on a chooser — but a list of several is exactly the thing you clicked for.
   */
  const openByDefault = (s: RailSection) =>
    s === "boards" ? (bundle.boards?.length ?? 0) > 1 : wideEnough;
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
      const boards = bundle.boards ?? [];
      const target = boards.find((b) => b.id === lastBoard) ?? boards[0];
      const to =
        next === "entries"
          ? frontDoor(tree) // the bundle's own front door, not the prefix
          : next === "boards"
            ? target && boardHref(target)
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
      <header className="border-border bg-surface elev-1 relative z-10 flex h-12 shrink-0 items-center gap-3 border-b px-3">
        {/* Breadcrumbs shrink and ellipsize; the omnibar keeps a workable
            width. The path orients you, the omnibar moves you. */}
        <div className="min-w-0 flex-1">
          <Breadcrumbs bundleName={bundle.label} root={tree} path={path} />
        </div>

        <div data-print="hide" className="hidden w-full max-w-sm shrink justify-center sm:flex">
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
            "border-border bg-bg ml-14 shrink-0 overflow-y-auto border-r",
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
  return section === "entries" || section === "boards";
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
