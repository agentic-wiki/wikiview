import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const location = useLocation();
  const [section, setSection] = useState<RailSection>(() => sectionFor(location.pathname));
  // Open on desktop, closed on narrow screens. Boards and grids need width;
  // this is a working tool on a wide screen before it is a phone app.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 768);
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

    // Going somewhere and showing the panel are separate decisions. Tangling
    // them is how clicking Entries from a board ended up doing nothing: the
    // icon was already the active one, so it took a shortcut past the
    // navigation it owed you.
    const boards = bundle.boards ?? [];
    if (!here) {
      if (next === "entries") navigate(frontDoor(tree));
      if (next === "boards") {
        const target = boards.find((b) => b.id === lastBoard) ?? boards[0];
        if (target) navigate(boardHref(target));
      }
    }

    // A list of one board is not a choice, so arriving at that board does not
    // also spend width on a chooser. Everything else opens the panel, including
    // clicking Boards while already on one — there, showing the list is the
    // only thing the click can do, and an icon that does nothing is the bug
    // this whole rail already had once.
    setPanelOpen(!(next === "boards" && boards.length === 1 && !here));
  };
  // The rail follows the route. Loading /kanban directly used to show the
  // Entries icon lit and the file tree open beside a board, because the section
  // started at a guess and only a rail click ever corrected it.
  //
  // On route changes rather than on every render, so a section with no route of
  // its own — Search — is not flipped back the instant you select it.
  useEffect(() => {
    setSection(sectionFor(location.pathname));
  }, [location.pathname]);

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

/** Which section a route belongs to. Search has no route, so it is never one. */
function sectionFor(pathname: string): RailSection {
  return pathname.startsWith("/kanban") ? "boards" : "entries";
}

/**
 * The boards a bundle declares.
 *
 * Only the declared ones, because this is a list of what the bundle offers.
 * Every folder is still boardable by URL, which is what the note says rather
 * than leaving an empty panel reading as "boards do not work here".
 */
function Boards({ boards, onPick }: { boards?: BoardConfig[]; onPick: (path: string) => void }) {
  if (!boards?.length) return <NoBoards />;

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
  );
}

/**
 * What the Boards panel shows before there are any.
 *
 * The empty state of a feature is the one moment somebody is definitely willing
 * to read how it works, so it says the two things worth knowing: that a folder
 * boards without any configuration, and what to write to keep one.
 *
 * The snippet is the whole of it — one required key — which is a better
 * argument for the config being cheap than a sentence claiming so. Declaring it
 * from here rather than by hand is [choosing which folders are
 * boards](backlog/4-boards/002-choosing-boards.md), and needs something that
 * can write TOML.
 */
function NoBoards() {
  return (
    <div className="space-y-3 p-3 text-sm">
      <p className="text-fg font-medium">No boards yet</p>
      <p className="text-muted">
        Any folder opens as one at <code>/kanban/</code> followed by its path, without
        configuring anything.
      </p>
      <p className="text-muted">To keep one here, add it to the bundle's <code>wiki.toml</code>:</p>
      <pre className="border-border bg-surface text-muted overflow-x-auto rounded-md border p-2 text-xs">
        {`[[tool.wikiview.board]]\npath = "/backlog"`}
      </pre>
    </div>
  );
}

/**
 * A board's address.
 *
 * The id rather than the path, because two boards can be over one folder and
 * only the id tells them apart. A folder nobody declared is still reachable by
 * its path — the server resolves ids first and falls back — but a declared
 * board is always linked to by the name it declared.
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
