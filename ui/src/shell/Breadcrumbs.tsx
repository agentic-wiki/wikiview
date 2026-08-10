import { Link } from "react-router";

/**
 * How many path segments to show before collapsing the middle.
 *
 * A bundle path can be six folders deep, and a breadcrumb that wraps or pushes
 * the header controls off screen is worse than one that elides. First and last
 * are kept because they are what orient you: which bundle, and what you are
 * looking at.
 */
const MAX_SEGMENTS = 4;

export function Breadcrumbs({ bundleName, path }: { bundleName: string; path: string }) {
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
      <span className="text-fg shrink-0 font-medium">{bundleName}</span>
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
            <span className="text-fg truncate">{seg.name}</span>
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
