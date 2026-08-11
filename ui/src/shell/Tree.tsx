import { useEffect, useMemo } from "react";
import { NavLink, useLocation } from "react-router";
import type { TreeNode } from "@/api";
import { useBundleState } from "@/state";
import { folderHasUnseen } from "@/seen";

/**
 * The bundle's folders and entries.
 *
 * Folders are collapsed by default — a large bundle should open navigable
 * rather than as a wall — except along the path to whatever is being viewed, so
 * arriving at a deep entry shows you where you are instead of an empty tree.
 * Reopening that path is automatic on navigation, and manual toggles are kept
 * afterwards: an expansion you performed is not undone by the next click.
 */
/**
 * A dot saying something changed here since you last looked.
 *
 * A dot rather than a count: a count has to be recomputed as descendants clear,
 * and a wrong count is more annoying than no count. What it means is the same
 * either way — look inside.
 */
function Unseen() {
  return (
    <span
      className="bg-accent ml-auto size-1.5 shrink-0 rounded-full"
      title="Changed since you last opened it"
      aria-label="changed"
    />
  );
}

export function Tree({
  node,
  bundleId,
  unseen,
}: {
  node: TreeNode;
  bundleId: string;
  unseen: Set<string>;
}) {
  const location = useLocation();
  const current = decodeURIComponent(location.pathname).replace(/^\/wiki/, "");
  // Kept across reloads, and scoped to this bundle: the paths mean nothing in
  // another one. Stored as a list because that is what JSON has; a Set is what
  // the render wants.
  const [expanded, setExpanded] = useBundleState<string[]>(bundleId, "tree:expanded", []);
  const open = useMemo(() => new Set(expanded), [expanded]);

  // Ancestors of the current entry, reopened whenever it changes. A union
  // rather than a replacement, so folders opened by hand stay open.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const parts = current.split("/").filter(Boolean).slice(0, -1);
      let path = "";
      for (const part of parts) {
        path += "/" + part;
        next.add(path);
      }
      // Same set, same array: returning a new one every navigation would write
      // to storage and re-render on every click through the tree.
      return next.size === prev.length ? prev : [...next];
    });
  }, [current, setExpanded]);

  const toggle = (path: string) =>
    setExpanded((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );

  return (
    <Level node={node} depth={0} open={open} toggle={toggle} current={current} unseen={unseen} />
  );
}

function Level({
  node,
  depth,
  open,
  toggle,
  current,
  unseen,
}: {
  node: TreeNode;
  depth: number;
  open: Set<string>;
  toggle: (path: string) => void;
  current: string;
  unseen: Set<string>;
}) {
  return (
    <ul className="text-sm">
      {node.children.map((child) => {
        const isOpen = open.has(child.path);
        return (
          <li key={child.path}>
            <button
              type="button"
              onClick={() => toggle(child.path)}
              aria-expanded={isOpen}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              className="text-fg hover:bg-fg/5 flex w-full items-center gap-1 py-1 pr-3 text-left"
            >
              <svg
                viewBox="0 0 24 24"
                className={[
                  "text-muted size-3.5 shrink-0 transition-transform duration-150",
                  isOpen ? "rotate-90" : "",
                ].join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden
              >
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="truncate">{child.label ?? child.name}</span>
              {/* Only while shut. Once it is open the marks inside say it
                  better, and a folder wearing its children's dot as well is
                  the same fact twice. */}
              {!isOpen && folderHasUnseen(child, unseen) && <Unseen />}
            </button>
            {isOpen && (
              <Level
                node={child}
                depth={depth + 1}
                open={open}
                toggle={toggle}
                current={current}
                unseen={unseen}
              />
            )}
          </li>
        );
      })}

      {node.entries.map((e) => (
        <li key={e.path}>
          <NavLink
            to={"/wiki" + e.path}
            style={{ paddingLeft: `${depth * 12 + 25}px` }}
            className={({ isActive }) =>
              [
                "flex items-center gap-2 py-1 pr-3",
                isActive ? "text-accent bg-accent/10" : "text-muted hover:text-fg hover:bg-fg/5",
              ].join(" ")
            }
            title={e.name}
          >
            <span className="truncate">{e.label}</span>
            {unseen.has(e.path) && <Unseen />}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
