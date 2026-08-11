import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import type { TreeNode } from "@/api";

/**
 * The bundle's folders and entries.
 *
 * Folders are collapsed by default — a large bundle should open navigable
 * rather than as a wall — except along the path to whatever is being viewed, so
 * arriving at a deep entry shows you where you are instead of an empty tree.
 * Reopening that path is automatic on navigation, and manual toggles are kept
 * afterwards: an expansion you performed is not undone by the next click.
 */
export function Tree({ node }: { node: TreeNode }) {
  const location = useLocation();
  const current = decodeURIComponent(location.pathname).replace(/^\/wiki/, "");
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Ancestors of the current entry, reopened whenever it changes. A union
  // rather than a replacement, so folders opened by hand stay open.
  useEffect(() => {
    setOpen((prev) => {
      const next = new Set(prev);
      const parts = current.split("/").filter(Boolean).slice(0, -1);
      let path = "";
      for (const part of parts) {
        path += "/" + part;
        next.add(path);
      }
      return next;
    });
  }, [current]);

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return <Level node={node} depth={0} open={open} toggle={toggle} current={current} />;
}

function Level({
  node,
  depth,
  open,
  toggle,
  current,
}: {
  node: TreeNode;
  depth: number;
  open: Set<string>;
  toggle: (path: string) => void;
  current: string;
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
              <span className="truncate">{child.name}</span>
            </button>
            {isOpen && (
              <Level node={child} depth={depth + 1} open={open} toggle={toggle} current={current} />
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
                "block truncate py-1 pr-3",
                isActive ? "text-accent bg-accent/10" : "text-muted hover:text-fg hover:bg-fg/5",
              ].join(" ")
            }
            title={e.title}
          >
            {e.title}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
