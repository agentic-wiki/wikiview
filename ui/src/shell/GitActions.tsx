import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type GitResult, type GitStatus } from "@/api";

/**
 * Refresh, pull and sync.
 *
 * The first things wikiview does that reach outside the machine, and the first
 * that are hard to take back, so they are shaped accordingly: pull and sync show
 * what they will do and act on confirmation.
 *
 * Refresh does not. It re-reads the files, reaches nothing and undoes nothing —
 * previewing "I will look at the disk again" would be ceremony, and the rule it
 * would be obeying exists for the two that can strand somebody.
 *
 * Absent rather than broken when the bundle is not a repository, or when git is
 * not installed: a bundle is a folder first, and most folders are neither.
 */
export function GitActions({ refresh }: { refresh: number }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [open, setOpen] = useState<"pull" | "sync" | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-read whenever the bundle's version moves: a commit somebody else made,
  // or an entry an agent wrote, both change what a sync would carry.
  useEffect(() => {
    const ac = new AbortController();
    api
      .git(ac.signal)
      .then((r) => !ac.signal.aborted && setStatus(r.status))
      .catch(() => {});
    return () => ac.abort();
  }, [refresh]);

  const onRefresh = useCallback(async () => {
    setBusy(true);
    try {
      await api.refresh();
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div data-print="hide" className="flex shrink-0 items-center gap-0.5">
      <Icon label="Refresh the index" onClick={onRefresh} disabled={busy}>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
      </Icon>

      {/* Nothing to pull from or push to without an upstream, so there is
          nothing to offer. */}
      {status?.repo && status.remote !== "" && (
        <>
          <Icon label="Pull" onClick={() => setOpen("pull")} count={status.behind}>
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          </Icon>
          <Icon
            label="Sync"
            onClick={() => setOpen("sync")}
            count={status.ahead + status.changes.length}
          >
            <path d="M12 21V9M7 14l5-5 5 5M5 3h14" />
          </Icon>
        </>
      )}

      {open && status && (
        <Preview
          action={open}
          status={status}
          onStatus={setStatus}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function Icon({
  label,
  onClick,
  disabled,
  count,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** How many things this action would move, shown only when there are any. */
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="text-muted hover:text-fg hover:bg-fg/5 relative grid size-8 shrink-0 place-items-center rounded-md disabled:opacity-40"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
      {count !== undefined && count > 0 && (
        <span className="bg-accent absolute top-0.5 right-0.5 size-1.5 rounded-full" aria-hidden />
      )}
    </button>
  );
}

/**
 * What the action will do, before it does it.
 *
 * Not ceremony: a push cannot be taken back from here, and a rebase that stops
 * halfway leaves a conflicted worktree that a web page has no business asking
 * anybody to resolve.
 */
function Preview({
  action,
  status,
  onStatus,
  onClose,
}: {
  action: "pull" | "sync";
  status: GitStatus;
  onStatus: (status: GitStatus) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(() => proposeMessage(status.changes));
  // Acting, as opposed to the read a pull does on opening. Two states because
  // the button names what it is doing, and "Pulling…" during a fetch would name
  // the wrong thing.
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(action === "pull");
  const [error, setError] = useState<string | null>(null);
  // The name a rescue would use, offered by the server with the failure that
  // needs it.
  const [proposed, setProposed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // A rescue is the one success worth staying open for: the branch name is the
  // whole point of it, and dismissing the dialog would take away the only place
  // it is written down.
  const [rescued, setRescued] = useState<string | null>(null);

  // A dialog whose work is finished has nothing left to say, so it says it and
  // goes. Long enough to read one word, short enough not to be a step.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(onClose, 1200);
    return () => clearTimeout(timer);
  }, [done, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A pull previews what is actually there, which means asking the remote. That
  // is the one network read, and opening this is what asks for it.
  useEffect(() => {
    if (action !== "pull") return;
    api
      .gitFetch()
      .then((r) => onStatus(r.status))
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setFetching(false));
    // Once, on opening. Re-running when the status changes would fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  // What the button will do, and whether there is anything for it to do. A sync
  // with nothing staged is a push, and says so: asking to "commit and push" when
  // no commit is coming describes the wrong action.
  const nothing =
    action === "pull" ? status.behind === 0 : status.changes.length === 0 && status.ahead === 0;
  const label =
    action === "pull" ? "Pull" : status.changes.length > 0 ? "Commit and push" : "Push";

  const act = async (run: () => Promise<GitResult>, rescue?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      onStatus(result.status);
      if (rescue) setRescued(rescue);
      else setDone(true);
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      const body = err.body as GitResult | undefined;
      if (body?.status) onStatus(body.status);
      if (body?.proposed) setProposed(body.proposed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={action === "pull" ? "Pull" : "Sync"}
        onClick={(e) => e.stopPropagation()}
        className="border-border bg-bg flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-2xl"
      >
        <header className="border-border flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <span className="text-fg block text-sm font-medium capitalize">{action}</span>
            <span className="text-muted block truncate font-mono text-xs">
              {status.branch} → {status.remote}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-fg hover:bg-fg/5 ml-auto grid size-7 shrink-0 place-items-center rounded-md"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 grow space-y-3 overflow-y-auto p-4 text-sm">
          {action === "pull" ? (
            <p className="text-muted">
              {fetching && !error
                ? "Asking the remote what it has…"
                : status.behind === 0
                  ? "Nothing to pull: this branch is level with its upstream."
                  : `${status.behind} commit${status.behind === 1 ? "" : "s"} to take, rebasing your ${status.ahead} on top.`}
            </p>
          ) : (
            <>
              <p className="text-muted">
                {status.changes.length === 0 && status.ahead === 0
                  ? "Nothing to sync: no changes here and nothing waiting to push."
                  : `${status.changes.length} file${status.changes.length === 1 ? "" : "s"} to commit, ${status.ahead} commit${status.ahead === 1 ? "" : "s"} to push.`}
              </p>
              {/* Everything that would be committed, including work somebody else
                  did: an agent editing alongside is the expected case, and a
                  preview that hid its files would misdescribe the button. */}
              {status.changes.length > 0 && (
                <ul className="border-border max-h-40 overflow-y-auto rounded-md border p-2 font-mono text-xs">
                  {status.changes.map((c) => (
                    <li key={c.path} className="flex gap-2">
                      <span className="text-muted w-5 shrink-0">{c.code.trim() || "M"}</span>
                      <span className="text-fg truncate">{c.path}</span>
                    </li>
                  ))}
                </ul>
              )}
              {/* Staged work this sync will step around. Said because it is not
                  going to happen: somebody who staged files in a terminal and
                  then pressed a button called "commit and push" has every
                  reason to think both got committed.
                  Only alongside a commit, since that is the sentence's subject.
                  A push has nothing to leave out, and repeating the warning over
                  a dialog with nothing to commit makes it furniture. */}
              {status.changes.length > 0 && status.outside > 0 && (
                <p className="text-warn bg-warn/8 border-warn/25 rounded-md border px-2.5 py-2 text-xs">
                  {status.outside} staged file{status.outside === 1 ? "" : "s"} elsewhere in this
                  repository {status.outside === 1 ? "is" : "are"} outside the bundle, and will not
                  be committed. Handle {status.outside === 1 ? "it" : "them"} in a terminal.
                </p>
              )}
              {/* Only when something would be committed. A bundle whose commits
                  were made in a terminal has nothing to say about a commit that
                  is not happening, and asking for a message anyway would be a
                  box to dismiss on the way to a push. */}
              {status.changes.length > 0 && (
                <label className="block space-y-1">
                  <span className="text-fg block text-xs font-medium">Commit message</span>
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    aria-label="Commit message"
                    className="border-border bg-bg text-fg w-full rounded-md border px-2 py-1"
                  />
                </label>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* The way out of a failed pull. The local work is intact and still
              local; this puts it somewhere else so the conflict can be resolved
              with a real tool on a real checkout. */}
          {proposed && (
            <div className="border-border space-y-2 rounded-md border p-3">
              <p className="text-muted text-xs">
                Your work is untouched. Push it to a branch and resolve this where you have a
                terminal.
              </p>
              <input
                value={proposed}
                onChange={(e) => setProposed(e.target.value)}
                aria-label="Branch name"
                className="border-border bg-bg text-fg w-full rounded-md border px-2 py-1 font-mono text-xs"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => api.gitBranch(proposed), proposed)}
                className="border-border text-fg hover:bg-fg/5 w-full rounded-md border px-2 py-1 text-xs disabled:opacity-50"
              >
                Push to this branch
              </button>
            </div>
          )}

          {rescued && !error && (
            <p className="text-fg text-sm">
              Your work is on <span className="font-mono text-xs">{rescued}</span>. Resolve the
              conflict where you have a terminal.
            </p>
          )}

          {done && !error && <p className="text-muted text-sm">Done.</p>}
        </div>

        <footer className="border-border flex shrink-0 items-center gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg ml-auto rounded-md px-3 py-1.5 text-sm"
          >
            Close
          </button>
          <button
            type="button"
            // Inert when there is nothing to do, rather than offering a button
            // whose only outcome is telling you it did nothing.
            disabled={busy || fetching || done || nothing}
            onClick={() =>
              act(() => (action === "pull" ? api.gitPull() : api.gitSync(message)))
            }
            className="bg-accent rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? (action === "pull" ? "Pulling…" : "Pushing…") : label}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * The commit message a sync starts with.
 *
 * Derived from what changed, because the alternatives are worse in both
 * directions. An empty box asks somebody to name work they just watched an agent
 * do, every time, for a log nobody reads that closely. A fixed string with the
 * date in it — "Update notes 2026-08-12 14:30" — says nothing a commit does not
 * already carry: git records when, and repeating it in the subject line is
 * duplicating metadata git owns while still saying nothing about the change.
 *
 * So: name the file when there is one, count them when there are several. It is
 * a starting point in an editable box, not a decision — anybody with something
 * better to say types it.
 */
export function proposeMessage(changes: { path: string }[]): string {
  if (changes.length === 0) return "Update notes";
  if (changes.length === 1) return "Update " + changes[0]!.path;
  const folder = commonFolder(changes.map((c) => c.path));
  return `Update ${changes.length} entries` + (folder ? " in " + folder : "");
}

/** The folder every path shares, or "" when they share none. */
function commonFolder(paths: string[]): string {
  const parts = paths.map((p) => p.split("/").slice(0, -1));
  const shared: string[] = [];
  for (let i = 0; i < (parts[0]?.length ?? 0); i++) {
    const segment = parts[0]![i]!;
    if (!parts.every((p) => p[i] === segment)) break;
    shared.push(segment);
  }
  return shared.join("/");
}
