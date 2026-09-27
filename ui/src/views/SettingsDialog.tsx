import { useEffect, type ReactNode } from "react";

/**
 * The frame every view's settings sit in: a dialog over the view, a header
 * naming what is being set up, and a save that writes the bundle's wiki.toml.
 *
 * One frame, so a board's settings and a graph's close, save and fail the same
 * way; each view owns only its fields.
 */
export function SettingsDialog({
  title,
  path,
  busy,
  error,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  /** The folder the view is over, which says which view this is. */
  path: string;
  busy: boolean;
  /** The server's words for why a save was refused, which are worth showing. */
  error: string | null;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-print="hide"
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onClick={onClose}
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="border-border bg-surface elev-3 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border"
      >
        {/* The path under the title, where it says which view this is rather
            than sitting where a dialog's close is. */}
        <header className="border-border flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <span className="text-fg block text-sm font-medium">{title}</span>
            <span className="text-muted block truncate font-mono text-xs">{path}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-muted hover:text-fg hover:bg-fg/5 ml-auto grid size-7 shrink-0 place-items-center rounded-md"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 grow space-y-5 overflow-y-auto p-4 text-sm">
          {children}
          {error && <p className="text-danger text-sm">{error}</p>}
        </div>

        <footer className="border-border flex shrink-0 items-center gap-2 border-t px-4 py-3">
          <span className="text-muted text-xs">Writes to the bundle's wiki.toml.</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg ml-auto rounded-md px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="bg-accent text-accent-fg rounded-md px-3 py-1.5 text-sm font-medium hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}

/**
 * Saving settings: busy while the write is in flight, closed when it lands, and
 * the server's words kept when it is refused. The server owns whether a filter
 * parses and whether the table can be edited at all.
 */
export async function saving(
  write: () => Promise<unknown>,
  setBusy: (b: boolean) => void,
  setError: (e: string | null) => void,
  onClose: () => void,
) {
  setBusy(true);
  setError(null);
  try {
    await write();
    onClose();
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setBusy(false);
  }
}

/** A labelled input. The label says what it is; a sentence under every one of
 *  them is a wall of text explaining boxes that were already labelled. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-fg block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}
