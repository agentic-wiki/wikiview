import { useState } from "react";
import { NavLink } from "react-router";
import type { TreeNode } from "@/api";

/** The bundle's folders and entries. Folders start expanded near the root and
 *  collapsed deeper, so a large bundle opens navigable rather than as a wall. */
export function Tree({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <ul className="py-2 text-sm">
      {node.children.map((child) => (
        <Folder key={child.path} node={child} depth={depth} />
      ))}
      {node.entries.map((e) => (
        <li key={e.path}>
          <NavLink
            to={"/wiki" + e.path}
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
            className={({ isActive }) =>
              [
                "block truncate py-1 pr-3",
                isActive ? "text-accent bg-accent/10" : "text-muted hover:text-fg hover:bg-fg/5",
              ].join(" ")
            }
            title={e.title || e.name}
          >
            {e.title || e.name}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Folder({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className="text-fg hover:bg-fg/5 flex w-full items-center gap-1 py-1 pr-3 text-left font-medium"
      >
        <svg
          viewBox="0 0 24 24"
          className={["size-3.5 shrink-0 transition-transform duration-150", open ? "rotate-90" : ""].join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="truncate">{node.name}</span>
      </button>
      {open && <Tree node={node} depth={depth + 1} />}
    </li>
  );
}
