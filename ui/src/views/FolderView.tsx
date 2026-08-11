import { Link } from "react-router";
import type { TreeNode } from "@/api";

/**
 * A folder with no index.md.
 *
 * The listing is generated here, in the UI. It must never write an index.md to
 * make the folder look tidier: creating files in someone's bundle because the
 * interface found it convenient is exactly what the format's neutral-engine
 * line rules out. Offering to create one is an explicit action, later.
 */
export function FolderView({ folder }: { folder: TreeNode }) {
  const empty = folder.entries.length === 0 && folder.children.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-fg text-2xl font-semibold tracking-tight">{folder.name || "/"}</h1>
      <p className="text-muted mt-1 text-sm">
        {empty
          ? "Nothing here yet."
          : `${count(folder.children.length, "subfolder")} · ${count(folder.entries.length, "entry", "entries")}`}
      </p>

      {!empty && (
        <ul className="mt-6 space-y-1">
          {folder.children.map((c) => (
            <Row
              key={c.path}
              to={"/wiki" + c.path + "/"}
              icon={<FolderIcon />}
              title={c.name}
              meta={count(c.entries.length + c.children.length, "item")}
            />
          ))}
          {folder.entries.map((e) => (
            <Row
              key={e.path}
              to={"/wiki" + e.path}
              icon={<FileIcon />}
              title={e.title}
              subtitle={e.title.toLowerCase() !== e.name.replace(/\.md$/, "").toLowerCase() ? e.name : undefined}
              meta={e.type}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A row, not a table cell. Dividers are borrowed weight: with an icon, a hover
 * surface, and space between rows, the list reads as a list without needing
 * rules between every item.
 */
function Row({
  to,
  icon,
  title,
  subtitle,
  meta,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="hover:bg-fg/[0.04] active:bg-fg/[0.08] group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
      >
        {/* The icon carries the accent permanently: it is what makes a row
            scannable as a row rather than a line of text. */}
        <span className="text-accent shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="text-fg group-hover:text-accent block truncate text-sm transition-colors">
            {title}
          </span>
          {subtitle && <span className="text-muted block truncate text-xs">{subtitle}</span>}
        </span>
        {meta && <span className="text-muted shrink-0 text-xs tabular-nums">{meta}</span>}
      </Link>
    </li>
  );
}

function count(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M6 3h7l5 5v13H6z M13 3v5h5" strokeLinejoin="round" />
    </svg>
  );
}
