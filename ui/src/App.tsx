import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { api, onVersion, type BundleInfo, type TreeNode } from "@/api";
import { Shell } from "@/shell/Shell";
import { EntryView } from "@/views/EntryView";
import { FolderView } from "@/views/FolderView";

export function App() {
  const [bundle, setBundle] = useState<BundleInfo | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever the server says content changed. Views depend on it, so a
  // change refetches what is on screen without anything tracking which entry
  // that is.
  const [version, setVersion] = useState(0);

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
  }, [version]);

  // Subscribed once for the life of the app: the stream reports staleness, and
  // resubscribing per view would drop events between navigations.
  useEffect(() => onVersion(setVersion), []);

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
    <Shell bundle={bundle} tree={tree}>
      <Routes>
        {/* The front door is the bundle's own index.md. */}
        <Route path="/" element={<Navigate to="/wiki/index.md" replace />} />
        <Route path="/wiki/*" element={<Router tree={tree} version={version} />} />
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
function Router({ tree, version }: { tree: TreeNode; version: number }) {
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
  return <EntryView path={path} version={version} />;
}

function findFolder(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node;
  for (const child of node.children) {
    const found = findFolder(child, path);
    if (found) return found;
  }
  return null;
}
