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
        className="text-fg hover:text-accent caps shrink-0 font-medium transition-colors"
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
            // Names made readable the way the tree does, folders included. You
            // navigated to a file, so this says which file; what the entry calls
            // itself belongs on the entry. The raw name stays in the URL and the
            // tooltip, where it is the identity rather than a label.
            <span className="text-fg truncate" title={seg.name}>
              {labelFor(root, upTo(segments, seg.index)) ?? seg.name}
            </span>
          ) : (
            <Link
              to={"/wiki" + upTo(segments, seg.index) + "/"}
              className="text-muted hover:text-fg truncate"
            >
              {labelFor(root, upTo(segments, seg.index)) ?? seg.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/** The bundle path formed by the first `index + 1` segments. */
function upTo(segments: string[], index: number): string {
  return "/" + segments.slice(0, index + 1).join("/");
}

/**
 * The readable name for a bundle path, whether it names a folder or an entry.
 *
 * One lookup for both because a breadcrumb does not care which it is walking
 * through, and two would be two chances to disagree with the tree.
 */
function labelFor(root: TreeNode, path: string): string | undefined {
  const target = path.replace(/\/$/, "") || "/";
  const find = (node: TreeNode): string | undefined => {
    if (node.path === target) return node.label;
    for (const e of node.entries) if (e.path === target) return e.label;
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
