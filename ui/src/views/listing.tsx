import { Link } from "react-router";

/**
 * The row a list of entries is made of.
 *
 * One row shape for every listing: a folder without an `index.md`, and the list
 * of what changed since you last looked. They are the same thing on screen — a
 * page of entries you are choosing between — and two row shapes would be two
 * places to fix a truncation bug.
 *
 * A row, not a table cell. Dividers are borrowed weight: with an icon, a hover
 * surface, and space between rows, the list reads as a list without needing
 * rules between every item.
 */
export function Row({
  to,
  icon,
  title,
  subtitle,
  meta,
  action,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  /** A control belonging to this row, beside the link rather than inside it: a
   *  button within an anchor is neither valid nor clickable as itself. */
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-1">
      <Link
        to={to}
        className="hover:bg-fg/[0.04] active:bg-fg/[0.08] group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
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
      {action}
    </li>
  );
}

export function count(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinejoin="round" />
    </svg>
  );
}

export function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M6 3h7l5 5v13H6z M13 3v5h5" strokeLinejoin="round" />
    </svg>
  );
}
