import { Link } from "react-router";
import type { TreeNode } from "@/api";

/**
 * How many path segments to show before collapsing the middle.
 *
 * A bundle path can be six folders deep, and a breadcrumb that wraps or pushes
 * the header controls off screen is worse than one that elides. First and last
 * are kept because they are what orient you: which bundle, and what you are
 * looking at.
 */
const MAX_SEGMENTS = 4;

export function Breadcrumbs({
  bundleName,
  root,
  path,
}: {
  bundleName: string;
  root: TreeNode;
  path: string;
}) {
  const segments = path.replace(/^\//, "").split("/").filter(Boolean);

  const shown =
    segments.length <= MAX_SEGMENTS
      ? segments.map((name, i) => ({ name, index: i }))
      : [
          { name: segments[0]!, index: 0 },
          { name: "…", index: -1 },
          ...segments.slice(-2).map((name, i) => ({ name, index: segments.length - 2 + i })),
        ];

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      <Link
        to={rootDestination(root)}
        className="text-fg hover:text-accent shrink-0 font-medium transition-colors"
        title="Go to the bundle's front door"
      >
        {bundleName}
      </Link>
      {shown.map((seg, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          <span className="text-muted/60 shrink-0" aria-hidden>
            /
          </span>
          {seg.index < 0 ? (
            // Collapsed segments. A dropdown listing them is the next step; the
            // ellipsis carries the fact that something is hidden either way.
            <span className="text-muted shrink-0" title={segments.join("/")}>
              …
            </span>
          ) : seg.index === segments.length - 1 ? (
            // The entry's name, not its filename — the same name the tree, the
            // palette and a backlink to it show. The filename stays in the URL
            // and in the tooltip, where it is the identity rather than a label.
            <span className="text-fg truncate" title={seg.name}>
              {displayName(root, path) ?? seg.name}
            </span>
          ) : (
            <Link
              to={"/wiki/" + segments.slice(0, seg.index + 1).join("/") + "/"}
              className="text-muted hover:text-fg truncate"
            >
              {seg.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/** The entry's display title, when the path names one. */
function displayName(root: TreeNode, path: string): string | undefined {
  const target = "/" + path.replace(/^\//, "").replace(/\/$/, "");
  const find = (node: TreeNode): string | undefined => {
    for (const e of node.entries) if (e.path === target) return e.title;
    for (const c of node.children) {
      const found = find(c);
      if (found) return found;
    }
    return undefined;
  };
  return find(root);
}

/**
 * Where the bundle's name points.
 *
 * `index.md` is the format's front door and comes first. `README.md` is the
 * convention every other tool that opens this folder will honour — GitHub, an
 * editor's preview — so a bundle that has one and no index is not left with a
 * dead name. Failing both, the folder listing, which is generated rather than
 * stored: nothing is written to make the root look complete.
 */
function rootDestination(root: TreeNode): string {
  if (root.index) return "/wiki" + root.index;
  const readme = root.entries.find((e) => e.name.toLowerCase() === "readme.md");
  if (readme) return "/wiki" + readme.path;
  return "/wiki/";
}
