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
  const [section, setSection] = useState<RailSection>("entries");
  // Open on desktop, closed on narrow screens. Boards and grids need width;
  // this is a working tool on a wide screen before it is a phone app.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 768);
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.replace(/^\/wiki\/?/, "");
  // The board you were last on, so the rail returns you to it rather than to
  // whichever one happens to be declared first. A view preference, so it is
  // scoped to this bundle like the rest.
  const [lastBoard, setLastBoard] = useBundleState(bundle.id, "board", "");

  /**
   * Clicking a rail icon.
   *
   * It opens the panel, switches section, and goes somewhere — because an icon
   * that only changes what a hidden panel would show does nothing you can see,
   * which is exactly how this behaved when picking a board collapsed the panel
   * and left the hamburger as the only way back.
   *
   * Nothing moves you if you are already in that section: clicking Entries
   * while reading an entry shows the tree beside what you are reading rather
   * than throwing you back to the front door.
   */
  const pick = (next: RailSection) => {
    // Whether the route is already showing this section's kind of thing. The
    // section and the route can disagree — arriving at a board by URL leaves
    // the section on Entries — so the toggle below has to ask the route rather
    // than trusting which icon looks active.
    const here =
      next === "entries"
        ? location.pathname.startsWith("/wiki")
        : next === "boards"
          ? location.pathname.startsWith("/kanban")
          : true;

    // The active icon collapses the panel, so the rail is also how you get the
    // width back rather than the hamburger being the only way.
    if (next === section && panelOpen && here) {
      setPanelOpen(false);
      return;
    }
    setSection(next);
    setPanelOpen(true);
    if (here) return; // already looking at one; show the panel beside it

    if (next === "entries") navigate(frontDoor(tree));
    if (next === "boards") {
      const boards = bundle.boards ?? [];
      const target = boards.find((b) => b.path === lastBoard) ?? boards[0];
      if (target) navigate(boardHref(target));
    }
  };
  // The view area scrolls, not the document, so scroll restoration works from
  // this element rather than from the window.
  const viewRef = useRef<HTMLElement>(null);

  return (
    <div className="flex h-full flex-col">
      <header className="border-border bg-surface flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <button
          type="button"
          aria-label={panelOpen ? "Hide navigation" : "Show navigation"}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
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

        <div className="hidden w-full max-w-sm shrink justify-center sm:flex">
          <Omnibar tree={tree} unseen={unseen} />
        </div>

        <ThemeToggle />
      </header>

      <div className="relative flex min-h-0 grow">
        <Rail active={section} onSelect={pick} />

        {/* Offset by the rail's collapsed width; the rail expands over this
            rather than pushing it, so nothing here reflows. */}
        <aside
          className={[
            "border-border bg-bg ml-14 shrink-0 overflow-y-auto border-r",
            "transition-[width] duration-200 ease-out",
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
              onPick={(picked) => {
                setLastBoard(picked);
                setPanelOpen(false);
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
 * The boards a bundle declares.
 *
 * Only the declared ones, because this is a list of what the bundle offers.
 * Every folder is still boardable by URL, which is what the note says rather
 * than leaving an empty panel reading as "boards do not work here".
 */
function Boards({ boards, onPick }: { boards?: BoardConfig[]; onPick: (path: string) => void }) {
  if (!boards?.length) {
    return (
      <p className="text-muted p-3 text-sm">
        None declared in <code>wiki.toml</code>. You can still open any folder as
        a board by visiting its address, like{" "}
        <code className="whitespace-nowrap">/kanban/notes</code>.
      </p>
    );
  }

  return (
    <ul className="p-2">
      {boards.map((b) => (
        <li key={b.path}>
          {/* Two lines, because a board's name and the folder it covers answer
              different questions and a one-line row makes you hover to get the
              second. There are rarely more than a handful of these, so the
              space is affordable. */}
          <NavLink
            to={boardHref(b)}
            onClick={() => onPick(b.path)}
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
  );
}

/** A board's address. The root board is `/kanban`, not `/kanban//`. */
function boardHref(b: BoardConfig): string {
  return "/kanban" + (b.path === "/" ? "" : b.path);
}

/**
 * Where the reader opens: the bundle's own `index.md`, or the root listing when
 * it has none. The same front door the app opens on, so returning to Entries
 * from a board lands where starting fresh would.
 */
function frontDoor(tree: TreeNode): string {
  return tree.index ? "/wiki" + tree.index : "/wiki/";
}
