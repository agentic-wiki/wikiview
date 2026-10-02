import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import type { BundleInfo, TreeNode } from "@/api";
import { Rail, TabBar, type RailSection } from "@/shell/Rail";
import { Breadcrumbs, readerCrumbs, type Crumb } from "@/shell/Breadcrumbs";
import { Tree } from "@/shell/Tree";
import { Omnibar, type Command } from "@/shell/Omnibar";
import { DocumentTitle } from "@/shell/DocumentTitle";
import { ScrollRestoration } from "@/shell/ScrollRestoration";
import { ThemeToggle, themeLabel, useTheme } from "@/shell/Theme";
import { useBundleState } from "@/state";
import { GitActions, useGitStatus, type GitTab } from "@/shell/GitActions";
import { NewView } from "@/views/NewView";
import { frontDoor } from "@/tree";
import { SectionLabel } from "@/ui/SectionLabel";
import { NARROW, useMedia } from "@/media";
import { useEscape } from "@/ui/escape";
import { Glyph, IconButton } from "@/ui/IconButton";
import { count } from "@/count";

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
  // Below 780px the rail becomes a tab bar and the panel a drawer
  // (backlog/8-design/017). Read live, so a window resized or a phone turned
  // gets the layout for the width it now has.
  const narrow = useMedia(NARROW);
  const [drawer, setDrawer] = useState(false);
  // Going somewhere is done with the drawer.
  useEffect(() => setDrawer(false), [location.pathname]);
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
        : !narrow;
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

  // ⌘\ (Ctrl+\ elsewhere) opens and closes the panel beside the view: the
  // same toggle as clicking the active rail icon, for a hand already on the
  // keyboard. Re-registered as the section changes, so it always toggles the
  // panel you are looking at.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\" && hasPanel(section)) {
        e.preventDefault();
        toggle(section, !panelOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // What the header's controls act on, held here so the palette can act on
  // it too: one theme, one repository status, one open popover.
  const theme = useTheme();
  const [git, setGit] = useGitStatus(refresh);
  const [gitTab, setGitTab] = useState<GitTab | null>(null);

  // The palette's commands. Git only where there is an upstream to pull from
  // and push to, as with the pill; one per declared board and graph.
  const commands: Command[] = [
    ...(git?.repo && git.remote
      ? [
          {
            title: git.behind > 0 ? `Pull ${count(git.behind, "commit")}` : "Pull",
            sub: `git · ${git.remote} → ${git.branch || "detached"}`,
            kind: "Git",
            run: () => setGitTab("incoming"),
          },
          {
            title: "Commit & push…",
            sub: `git · ${count(git.changes.length, "file")} changed`,
            kind: "Git",
            run: () => setGitTab("changes"),
          },
        ]
      : []),
    {
      title: "Toggle theme",
      sub: `appearance · ${themeLabel(theme.theme)} → ${themeLabel(theme.next).toLowerCase()}`,
      kind: "Action",
      run: theme.cycle,
    },
    ...(bundle.boards ?? []).map((b) => ({
      title: "Open board · " + b.name,
      sub: b.path,
      kind: "Board",
      run: () => {
        setLastBoard(b.id);
        navigate("/kanban/" + encodeURIComponent(b.id));
      },
    })),
    ...(bundle.graphs ?? []).map((g) => ({
      title: "Open graph · " + g.name,
      sub: g.path,
      kind: "Graph",
      run: () => {
        setLastGraph(g.id);
        navigate("/graph/" + encodeURIComponent(g.id));
      },
    })),
    { title: "Recently changed", sub: `${unseen.size} unseen`, kind: "View", run: () => navigate("/changed") },
    { title: "Read later", sub: `${saved.size} saved`, kind: "View", run: () => navigate("/read-later") },
  ];

  const crumbs = trail(location.pathname, path, tree, bundle, (s) => toggle(s, true));

  /** What a section's panel holds, wherever it is drawn. */
  const panelFor = (s: RailSection) =>
    s === "boards" ? (
      <ViewsPanel
        kind="board"
        views={bundle.boards}
        tree={tree}
        rootLabel={bundle.label}
        intro={
          <>
            A board is a folder's entries, in columns by <code>status</code>. It holds tasks unless you choose otherwise.
          </>
        }
        // Choosing from the list is done with the list, so it gives the width
        // back — and animates, because that close is something you did rather
        // than something that happened around you.
        onPick={(picked) => {
          setLastBoard(picked);
          toggle("boards", false);
        }}
      />
    ) : s === "graphs" ? (
      <ViewsPanel
        kind="graph"
        views={bundle.graphs}
        tree={tree}
        rootLabel={bundle.label}
        intro="A graph is a folder's entries and the links between them."
        onPick={(picked) => {
          setLastGraph(picked);
          toggle("graphs", false);
        }}
      />
    ) : (
      <>
        <SectionLabel count={bundle.entries} className="pt-3.5 pr-3.5 pb-2 pl-4">
          Entries
        </SectionLabel>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <Tree node={tree} bundleId={bundle.id} unseen={unseen} saved={saved} />
        </div>
      </>
    );

  /**
   * A tab on a narrow screen: the section it names, and — tapped again where
   * you already are — the drawer with that section's panel, since there is no
   * panel beside the view to toggle.
   */
  const pickTab = (next: RailSection) => {
    const prefix = PREFIX[next];
    const showing = prefix === undefined || location.pathname.startsWith(prefix);
    if (next === section && showing && hasPanel(next)) setDrawer(true);
    else pick(next);
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
          is showing" while the icon names the section it hides.
          Layered above the side sheet (z-30), because what opens from here —
          the git popover — has to land over whatever the view has open. Below
          the narrow sheet's backdrop (z-55), which covers the whole screen. */}
      <header
        className={[
          "border-line bg-panel relative z-40 flex h-13 shrink-0 items-center border-b",
          narrow ? "gap-1 pr-2 pl-1.5" : "gap-2.5 pr-3 pl-2.5",
        ].join(" ")}
      >
        {narrow && (
          <IconButton label="Open the panel" onClick={() => setDrawer(true)} data-print="hide">
            <Glyph size={18}>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </Glyph>
          </IconButton>
        )}
        {/* The bundle, named once: the tile and the label are one link to the
            front door, and the trail beside it starts inside the bundle. */}
        <Link
          to={frontDoor(tree)}
          title="Go to the bundle's front door"
          // The one thing in the header that can give way: on a phone the name
          // ellipsizes before any control is pushed off the edge.
          className="hover:bg-fg/5 flex min-w-0 shrink items-center gap-2.5 rounded-lg py-1 pr-2 pl-1"
        >
          <span
            aria-hidden
            className="bg-accent text-on-accent grid size-6.5 shrink-0 place-items-center rounded-[7px] text-[13px] font-bold tracking-tight"
          >
            {initial(bundle.label)}
          </span>
          <span className="truncate font-semibold tracking-tight whitespace-nowrap">{bundle.label}</span>
        </Link>

        {/* The trail shrinks and ellipsizes; the search trigger keeps a workable
            width. The path orients you, the search moves you. */}
        <div className={narrow ? "flex-1" : "min-w-0 flex-1"}>{!narrow && <Breadcrumbs crumbs={crumbs} />}</div>

        <div data-print="hide" className="flex shrink">
          <Omnibar tree={tree} unseen={unseen} commands={commands} compact={narrow} />
        </div>

        <GitActions status={git} onStatus={setGit} open={gitTab} onOpen={setGitTab} compact={narrow} />

        <span data-print="hide">
          <ThemeToggle theme={theme.theme} next={theme.next} onCycle={theme.cycle} />
        </span>
      </header>

      <div className="relative flex min-h-0 grow">
        {!narrow && (
          <>
            <Rail
              active={section}
              onSelect={pick}
              counts={{ changed: unseen.size, later: saved.size }}
            />

            {/* `data-open` is the state, so nothing has to read it off a width. */}
            <aside
              data-print="hide"
              data-open={panelOpen}
              className={[
                "border-line bg-panel flex min-h-0 shrink-0 flex-col overflow-hidden border-r",
                animate ? "transition-[width] duration-200 ease-out" : "",
                panelOpen ? "w-67" : "w-0 border-r-0",
              ].join(" ")}
            >
              {panelOpen && panelFor(section)}
            </aside>
          </>
        )}
        {narrow && drawer && (
          // The section's own panel where it has one, the tree otherwise: the
          // drawer is how you move around, wherever you are.
          <Drawer onClose={() => setDrawer(false)}>{panelFor(hasPanel(section) ? section : "entries")}</Drawer>
        )}

        <main ref={viewRef} className="min-w-0 grow overflow-y-auto">
          <ScrollRestoration containerRef={viewRef} />
          {children}
        </main>
      </div>

      {narrow && <TabBar active={section} onSelect={pickTab} />}
    </div>
  );
}

/**
 * The panel on a narrow screen: a drawer over the view, under the header, with
 * a backdrop that closes it. It closes on navigation (the shell's effect), on
 * the backdrop, and on Escape.
 */
function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  return (
    <>
      <div
        data-print="hide"
        aria-hidden
        onClick={onClose}
        className="animate-wv-fade fixed inset-x-0 top-13 bottom-0 z-45 bg-black/50"
      />
      <aside
        data-print="hide"
        aria-label="Panel"
        className="border-line bg-panel shadow-float animate-wv-in fixed top-13 bottom-0 left-0 z-50 flex w-[min(320px,86vw)] flex-col border-r"
      >
        {children}
      </aside>
    </>
  );
}

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
 * With none declared, the panel says what this kind of view is and offers the
 * button that makes one. The empty state of a feature is the one moment somebody
 * is definitely willing to be shown how it works, and a note about what to
 * hand-write into `wiki.toml` leaves them to go and do it, which is exactly the
 * step this can take for them.
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
  const label = kind === "board" ? "Boards" : "Graphs";
  if (!views?.length) {
    return (
      <div className="space-y-3 overflow-y-auto p-3.5">
        <SectionLabel>Your first {kind}</SectionLabel>
        <p className="text-muted text-[13px] leading-relaxed">{intro}</p>
        <NewView kind={kind} tree={tree} rootLabel={rootLabel} />
      </div>
    );
  }

  return (
    <div className="min-h-0 overflow-y-auto">
      <SectionLabel className="pt-3.5 pr-3.5 pb-2 pl-4">{label}</SectionLabel>
      <ViewList prefix={kind === "board" ? "/kanban" : "/graph"} kind={kind} views={views} onPick={onPick} />

      {/* Without it, adding a second one means editing wiki.toml by hand, which
          is the dead end the empty state already avoids. */}
      <div className="p-2.5">
        <NewView kind={kind} tree={tree} rootLabel={rootLabel} />
      </div>
    </div>
  );
}

/** A declared view over a folder: a board or a graph, with how big it is. */
type Declared = { id: string; name: string; path: string; cards?: number; entries?: number };

/**
 * The declared views of one kind, as the panel lists them.
 *
 * Addressed by id rather than path, because two views can be over one folder
 * and only the id tells them apart. Two lines each, because a view's name and
 * the folder it covers answer different questions; there are rarely more than a
 * handful, so the space is affordable.
 */
function ViewList({
  prefix,
  kind,
  views,
  onPick,
}: {
  prefix: string;
  kind: "board" | "graph";
  views: Declared[];
  onPick: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5 px-2">
      {views.map((v) => (
        <li key={v.id}>
          <NavLink
            to={prefix + "/" + encodeURIComponent(v.id)}
            onClick={() => onPick(v.id)}
            className={({ isActive }) =>
              [
                "flex items-center gap-2.5 rounded-[9px] px-2.5 py-2",
                isActive ? "bg-accent-bg" : "hover:bg-fg/5",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className="bg-elev text-accent-ink grid size-7 shrink-0 place-items-center rounded-[7px] text-xs font-semibold"
                >
                  {(v.name.trim()[0] ?? "·").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={["block truncate font-medium", isActive ? "text-accent-ink" : "text-fg"].join(" ")}>
                    {v.name}
                  </span>
                  <span className="text-faint block truncate font-mono text-[11.5px]">
                    {v.path}
                    {kind === "board" && v.cards !== undefined && " · " + count(v.cards, "card")}
                    {kind === "graph" && v.entries !== undefined && " · " + count(v.entries, "entry", "entries")}
                  </span>
                </span>
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
