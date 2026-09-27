import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { EntryView } from "@/views/EntryView";
import type { Queue } from "@/queue";

/**
 * One entry, opened over the view it was picked from: a board's card, a graph's
 * node.
 *
 * A dialog rather than a side panel: a panel takes its width out of the view for
 * as long as it is open, and the view is what you came for. This borrows the
 * screen and gives it back, and the view stays visible around it, which is the
 * context you were reading the entry in.
 */
export function CardSheet({
  path,
  version,
  refresh,
  changedAt,
  queue,
  destination,
  onClose,
}: {
  path: string;
  version: number;
  refresh: number;
  changedAt?: number;
  queue: Queue;
  /** Where a link from the entry goes. The view decides: a link to something on
   *  it opens that over the view, and anything else leaves for the reader. */
  destination: (to: string) => string;
  onClose: () => void;
}) {
  // Escape closes, because a panel that only closes by finding its button is a
  // panel people leave open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The dialog scrolls its own body, so following a link from halfway down one
  // entry into another would start you halfway down that one. The reader solves
  // this for the page; nothing was solving it here.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [path]);

  return (
    <div
      // On paper the backdrop is a grey rectangle and a fixed box prints one
      // clipped page, so the sheet stops being a sheet and becomes the page.
      data-print="sheet"
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={path}
        onClick={(e) => e.stopPropagation()}
        // A fixed height rather than one taken from the content. An entry
        // arrives a moment after the dialog does, and a dialog sized by its
        // contents is a header alone until it lands, then a jump. It would also
        // resize under you when a link inside one entry opens another.
        className="border-border bg-surface elev-3 flex h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border"
      >
        <header className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <span className="text-muted truncate font-mono text-xs">{path}</span>
          <Link
            to={"/wiki" + path}
            data-print="hide"
            className="text-muted hover:text-fg ml-auto shrink-0 text-xs underline decoration-dotted underline-offset-2"
          >
            open in reader
          </Link>
          <button
            type="button"
            onClick={onClose}
            data-print="hide"
            aria-label="Close card"
            className="text-muted hover:text-fg hover:bg-fg/5 grid size-7 shrink-0 place-items-center rounded-md"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div ref={body} className="min-h-0 grow overflow-y-auto">
          <EntryView
            path={path}
            version={version}
            refresh={refresh}
            changedAt={changedAt}
            destination={destination}
            queued={queue.queued.has(path)}
            onQueue={() => queue.toggle(path)}
            inCard
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The address of an entry open over a view: `/<prefix>/<id>/<entry path>`.
 *
 * The id is one segment and never a folder name, so everything after the first
 * slash is the bundle path — no separator to invent and nothing to guess. Each
 * segment is encoded the way an entry URL's are, which leaves the slashes
 * between them alone and escapes anything inside a name that would end the
 * path early.
 */
export function sheetHref(prefix: string, id: string, path: string): string {
  const segments = path.replace(/^\//, "").split("/").map(encodeURIComponent);
  return prefix + "/" + encodeURIComponent(id) + "/" + segments.join("/");
}

/**
 * Splits `/<prefix>/<id>/<entry path>` into the view's id and the entry open on
 * it, "" for none. The first segment is always an id, which is what makes the
 * split exact.
 *
 * Takes the pathname decoded, and decodes nothing itself: decoding twice turns a
 * filename with a `%` in it into a different name.
 */
export function splitSheetPath(pathname: string, prefix: string): { id: string; path: string } {
  const rest = pathname.slice(prefix.length).replace(/^\//, "");
  const cut = rest.indexOf("/");
  return cut < 0 ? { id: rest, path: "" } : { id: rest.slice(0, cut), path: rest.slice(cut) };
}
