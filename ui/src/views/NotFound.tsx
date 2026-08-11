import { Link } from "react-router";

/**
 * Shown when a URL names nothing.
 *
 * Two ways to arrive: a path outside the app's routes (`/README.md` rather than
 * `/wiki/README.md`), and a `/wiki/…` path naming an entry that is not in the
 * bundle. Both used to render an empty page, which reads as a broken app rather
 * than as a wrong address.
 *
 * A missing entry is deliberately not phrased as an error. The format treats a
 * link to something unwritten as ordinary — knowledge not yet captured — so the
 * page says what is not there and offers the way back, without suggesting
 * something went wrong.
 */
export function NotFound({ path, hint }: { path?: string; hint?: string }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <p className="text-muted text-sm">{hint ?? "Nothing at this address"}</p>
      {path && (
        <p className="text-fg mt-2 font-mono text-sm break-all">{path}</p>
      )}
      <div className="mt-8 flex justify-center gap-3 text-sm">
        <Link
          to="/"
          className="border-border hover:bg-fg/5 rounded-md border px-3 py-1.5 transition-colors"
        >
          Go to the front door
        </Link>
      </div>
    </div>
  );
}
