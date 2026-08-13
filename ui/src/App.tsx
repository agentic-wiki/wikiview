import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { api, onVersion, type BundleInfo, type TreeNode } from "@/api";
import { useSeen } from "@/seen";
import { Shell } from "@/shell/Shell";
import { ClearSelection } from "@/shell/ClearSelection";
import { EntryView } from "@/views/EntryView";
import { FolderView } from "@/views/FolderView";
import { BoardView } from "@/views/BoardView";
import { NotFound } from "@/views/NotFound";

export function App() {
  const [bundle, setBundle] = useState<BundleInfo | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A refetch trigger, not the bundle's version. The SSE stream reports that
  // content changed; views depend on this so a change refetches what is on
  // screen without anything tracking which entry that is.
  //
  // The *authoritative* version is `bundle.version`, which is fetched alongside
  // the data and therefore describes what is actually on screen. Writes carry
  // that one: sending this counter would send 0 until the first event arrived,
  // and every write would be refused as stale.
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([api.bundle(ac.signal), api.tree(ac.signal)])
      .then(([b, t]) => {
        setBundle(b);
        setTree(t);
        setError(null);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(String(e.message ?? e));
      });
    return () => ac.abort();
  }, [refresh]);

  // The last version acted on. A ref rather than state: it is read inside a
  // subscription that must not be torn down and rebuilt when it changes.
  const seen = useRef<number | null>(null);

  // Subscribed once for the life of the app: the stream reports staleness, and
  // resubscribing per view would drop events between navigations.
  //
  // Only a version we have not already seen counts. The stream greets every
  // connection with the current version — deliberately, so a client connecting
  // after a change learns it is stale — and EventSource reconnects on its own,
  // so acting on every message meant a full refetch on connect and again on each
  // reconnect. That is visible: the page renders, then replaces itself a moment
  // later for no reason.
  useEffect(
    () =>
      onVersion((v) => {
        // The first greeting says what the initial load is already fetching.
        if (seen.current === null) {
          seen.current = v;
          return;
        }
        if (v === seen.current) return; // a reconnect repeating itself
        seen.current = v;
        setRefresh((n) => n + 1);
      }),
    [],
  );

  if (error) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="text-fg font-medium">Cannot reach the bundle</p>
          <p className="text-muted mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }
  if (!bundle || !tree) {
    return <div className="text-muted grid h-full place-items-center text-sm">Loading…</div>;
  }

  return (
    <Reader bundle={bundle} tree={tree} refresh={refresh} />
  );
}

/**
 * The mounted app, once the bundle and tree are in hand.
 *
 * Split out so `useSeen` can be called with them rather than with nulls, and
 * called exactly once: the marks in the tree and the clearing done by opening
 * an entry are the same state, and two copies of the hook would be two Reacts
 * states over one storage key, agreeing only after a reload.
 */
function Reader({
  bundle,
  tree,
  refresh,
}: {
  bundle: BundleInfo;
  tree: TreeNode;
  refresh: number;
}) {
  const { unseen, markSeen, changedAt } = useSeen(bundle.id, tree, entryPath(useLocation().pathname));

  return (
    <Shell bundle={bundle} tree={tree} unseen={unseen} refresh={refresh}>
      <ClearSelection />
      <MarkSeen onSeen={markSeen} />
      <Routes>
        {/* The front door is the bundle's own index.md. */}
        <Route path="/" element={<Navigate to="/wiki/index.md" replace />} />
        <Route
          path="/wiki/*"
          element={
            <Router
              tree={tree}
              changedAt={changedAt}
              version={bundle.version}
              refresh={refresh}
            />
          }
        />
        {/* A board is addressed by its id, and `root` is the one every bundle
            has without declaring anything. */}
        <Route
          path="/kanban/*"
          element={
            <BoardRoute
              tree={tree}
              changedAt={changedAt}
              rootLabel={bundle.label}
              version={bundle.version}
              refresh={refresh}
            />
          }
        />
        {/* Anything else. Without this a mistyped URL rendered an empty page,
            which reads as a broken app rather than a wrong address. */}
        <Route path="*" element={<UnknownRoute />} />
      </Routes>
    </Shell>
  );
}

/**
 * Decides whether a /wiki/* path names an entry or a folder.
 *
 * A folder with an index.md redirects to it, so one entry keeps one URL; a
 * folder without one keeps the folder URL and lists what is inside. That
 * decision needs the tree, which is why it lives here rather than in the route
 * table.
 */
function Router({
  tree,
  changedAt,
  version,
  refresh,
}: {
  tree: TreeNode;
  /** When each entry's content last moved, so a copy already read can be known
   *  to be current rather than guessed at. */
  changedAt: Record<string, number>;
  /** The version the data on screen was read at; travels with writes. */
  version: number;
  /** Changes when the server reports new content; forces a refetch. */
  refresh: number;
}) {
  // useLocation, not window.location: the latter is not reactive, so a
  // navigation that keeps this component mounted would render the previous
  // path. It happens to work today because <Routes> re-renders on navigation,
  // which is a coincidence rather than a contract.
  const location = useLocation();
  const path = "/" + decodeURIComponent(location.pathname).replace(/^\/wiki\/?/, "");
  const folder = findFolder(tree, path.replace(/\/$/, "") || "/");

  if (folder) {
    if (folder.index) return <Navigate to={"/wiki" + folder.index} replace />;
    return <FolderView folder={folder} />;
  }
  return (
    <EntryView path={path} version={version} refresh={refresh} changedAt={changedAt[path]} />
  );
}

/**
 * Clears an entry's mark by being on it.
 *
 * Opening is the trigger, not looking: a scroll or dwell heuristic would clear
 * marks without you doing anything, and a mark that vanishes on its own is
 * worse than one that stays. Reads the route rather than being called by the
 * view, so nothing has to be threaded through the reader to reach it.
 *
 * Marking again when the version moves is deliberate. A checkbox you ticked
 * changes the entry you are looking at, and you plainly saw it.
 */
function MarkSeen({ onSeen }: { onSeen: (path: string) => void }) {
  const { pathname } = useLocation();
  const path = entryPath(pathname);
  useEffect(() => onSeen(path), [path, onSeen]);
  return null;
}

/** The bundle path a route names, which is the route with /wiki off the front. */
function entryPath(pathname: string): string {
  return "/" + decodeURIComponent(pathname).replace(/^\/wiki\/?/, "");
}

/**
 * Splits `/kanban/<id>/<entry path>` into the board and the card open on it.
 *
 * The first segment is always a board id, never a folder, which is what makes
 * the split exact: everything after it is a bundle path, slashes and all.
 */
function BoardRoute({
  tree,
  changedAt,
  rootLabel,
  version,
  refresh,
}: {
  tree: TreeNode;
  changedAt: Record<string, number>;
  rootLabel: string;
  version: number;
  refresh: number;
}) {
  const { pathname } = useLocation();
  const rest = decodeURIComponent(pathname).replace(/^\/kanban\/?/, "");
  const cut = rest.indexOf("/");
  const id = cut < 0 ? rest : rest.slice(0, cut);
  const card = cut < 0 ? "" : rest.slice(cut); // keeps the leading slash
  return (
    <BoardView
      id={id}
      card={card}
      tree={tree}
      changedAt={changedAt}
      rootLabel={rootLabel}
      version={version}
      refresh={refresh}
    />
  );
}

function UnknownRoute() {
  const { pathname } = useLocation();
  return <NotFound path={pathname} />;
}

function findFolder(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node;
  for (const child of node.children) {
    const found = findFolder(child, path);
    if (found) return found;
  }
  return null;
}
