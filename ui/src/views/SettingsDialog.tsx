import type { ReactNode } from "react";
import { useEscape } from "@/ui/escape";

/**
 * The frame every view's settings sit in: a dialog over the view, a header
 * naming what is being set up, and a save that writes the bundle's wiki.toml.
 *
 * One frame, so a board's settings and a graph's close, save and fail the same
 * way; each view owns only its fields. Declaring a new view is the same dialog
 * with a different verb on its button.
 */
export function SettingsDialog({
  title,
  path,
  busy,
  error,
  onSubmit,
  onClose,
  action = "Apply",
  footnote = (
    <>
      Writes to the bundle's <span className="font-mono">wiki.toml</span>
    </>
  ),
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
  /** What the submit says: saving settings, or creating the view. */
  action?: string;
  /** Where Apply writes. A dialog with a field kept elsewhere says so here,
   *  since a footer claiming every field goes to wiki.toml would be wrong. */
  footnote?: ReactNode;
  children: ReactNode;
}) {
  useEscape(onClose);

  return (
    <div
      data-print="hide"
      className="animate-wv-fade fixed inset-0 z-80 flex items-center justify-center bg-black/55 p-4"
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
        className="bg-elev shadow-float animate-wv-in flex max-h-[90vh] w-[min(560px,100%)] flex-col overflow-hidden rounded-2xl"
      >
        {/* The path under the title, where it says which view this is rather
            than sitting where a dialog's close is. */}
        <header className="border-line flex shrink-0 items-center gap-2 border-b pt-4 pr-4 pb-3.5 pl-5">
          <div className="min-w-0">
            <span className="text-fg block text-base font-semibold">{title}</span>
            <span className="text-faint mt-0.5 block truncate font-mono text-xs">{path}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={"Close " + title.toLowerCase()}
            className="text-muted hover:text-fg hover:bg-fg/5 ml-auto grid size-7.5 shrink-0 place-items-center rounded-[7px]"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex min-h-0 grow flex-col gap-4.5 overflow-y-auto px-5 py-4.5">
          {children}
          {error && <p className="text-danger text-sm">{error}</p>}
        </div>

        <footer className="border-line flex shrink-0 items-center gap-2 border-t py-3 pr-4 pl-5">
          <span className="text-faint flex-1 text-xs">{footnote}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg hover:bg-fg/5 h-8.5 rounded-[9px] px-3.5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="bg-accent text-on-accent h-8.5 rounded-[9px] px-4 font-semibold hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Applying…" : action}
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
    <label className="flex flex-col gap-1.5">
      <span className="text-muted text-[12.5px] font-medium">{label}</span>
      {children}
    </label>
  );
}
