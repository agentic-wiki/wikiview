import { useCallback, useEffect, useRef, useState } from "react";
import { useEscape } from "@/ui/escape";
import { Glyph, IconButton } from "@/ui/IconButton";
import { api, ApiError, type GitResult, type GitStatus } from "@/api";
import { age } from "@/time";
import { useBundle } from "@/bundle";
import { count } from "@/count";
import { useToast } from "@/ui/Toast";

/**
 * Refresh, and the repository: a pill that says where the branch stands and a
 * popover that pulls and pushes (backlog/8-design/005).
 *
 * Pull and sync are the first things wikiview does that reach outside the
 * machine and the first that are hard to take back, so they are shaped
 * accordingly: each tab shows what its button will do, and nothing happens until
 * it is pressed.
 *
 * Refresh does not preview. It re-reads the files, reaches nothing and undoes
 * nothing — previewing "I will look at the disk again" would be ceremony, and
 * the rule it would be obeying exists for the two that can strand somebody.
 *
 * Absent rather than broken when the bundle is not a repository, has no
 * upstream, or git is not installed: a bundle is a folder first, and most
 * folders are none of those.
 */
export function GitActions({
  status,
  onStatus,
  open,
  onOpen,
  compact = false,
}: {
  /** The pill drops the branch name, keeping only its counts. */
  compact?: boolean;
  /** The repository, as `useGitStatus` last read it; null until it has. */
  status: GitStatus | null;
  onStatus: (status: GitStatus) => void;
  /** Which tab of the popover is open, null for none. Held by the shell, so
   *  the palette can open it too. */
  open: GitTab | null;
  onOpen: (tab: GitTab | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { bundle } = useBundle();
  // The pill and its popover, as one thing an outside click is outside of.
  const anchor = useRef<HTMLDivElement>(null);
  const setOpen = onOpen;
  const setStatus = onStatus;

  const onRefresh = useCallback(async () => {
    setBusy(true);
    try {
      await api.refresh();
      toast(`Reloaded ${count(bundle.entries, "entry", "entries")}`);
    } catch (e) {
      toast(String((e as Error).message ?? e), "danger");
    } finally {
      setBusy(false);
    }
  }, [toast, bundle.entries]);

  const close = useCallback(() => setOpen(null), []);

  return (
    <div data-print="hide" className="flex shrink-0 items-center gap-2.5">
      {/* Spins for as long as the re-read takes, so a click that is still
          working does not look like a click that did nothing. */}
      <IconButton label="Refresh the index" onClick={onRefresh} disabled={busy} aria-busy={busy}>
        <Glyph className={busy ? "animate-wv-spin" : ""}>
          <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
          <path d="M21 3v5h-5" />
        </Glyph>
      </IconButton>

      {/* Nothing to pull from or push to without an upstream, so there is
          nothing to offer. */}
      {status?.repo && status.remote !== "" && (
        <div ref={anchor}>
          <Pill status={status} compact={compact} open={open !== null} onClick={() => setOpen(open ? null : firstTab(status))} />
          {open && (
            <Popover
              tab={open}
              onTab={setOpen}
              status={status}
              onStatus={setStatus}
              onClose={close}
              anchor={anchor}
            />
          )}
        </div>
      )}
    </div>
  );
}

export type GitTab = "incoming" | "changes";
type Tab = GitTab;

/**
 * The bundle's repository, re-read whenever the bundle's version moves: a
 * commit somebody else made, or an entry an agent wrote, both change what a
 * sync would carry. Held by the shell, which hands it to the pill and the
 * palette alike.
 */
export function useGitStatus(refresh: number): [GitStatus | null, (status: GitStatus) => void] {
  const [status, setStatus] = useState<GitStatus | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    api
      .git(ac.signal)
      .then((r) => !ac.signal.aborted && setStatus(r.status))
      .catch(() => {});
    return () => ac.abort();
  }, [refresh]);
  return [status, setStatus];
}

/**
 * The tab the popover opens on: the one with something of yours in it. Local
 * work to push means Changes; otherwise Incoming, which is the only other thing
 * the popover is for.
 *
 * Not always Incoming, the reference's default, because showing Incoming is
 * what asks the remote. Opening the popover to push would then reach the
 * network first for a read nobody asked for.
 */
export function firstTab(status: GitStatus): Tab {
  return status.changes.length > 0 || status.ahead > 0 ? "changes" : "incoming";
}

/**
 * Where the branch stands, at a glance: its name, what is waiting to come in,
 * what is waiting to go out, or that there is neither.
 *
 * "Synced" is as of the last fetch, like every count here: nothing asks the
 * remote until the popover does.
 */
function Pill({
  status,
  compact,
  open,
  onClick,
}: {
  status: GitStatus;
  compact: boolean;
  open: boolean;
  onClick: () => void;
}) {
  const changed = status.changes.length;
  const synced = status.behind === 0 && status.ahead === 0 && changed === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Source control"
      aria-haspopup="dialog"
      aria-expanded={open}
      title={`${status.branch || "detached"} ⇄ ${status.remote}`}
      className={[
        "bg-panel-2 text-muted flex h-8.5 items-center gap-2 rounded-[9px] border px-2.5 font-mono text-xs",
        open ? "border-accent" : "border-line hover:border-line-2",
      ].join(" ")}
    >
      <Glyph size={15}>
        <circle cx="6" cy="5" r="2.2" />
        <circle cx="6" cy="19" r="2.2" />
        <circle cx="18" cy="7" r="2.2" />
        <path d="M6 7.2v9.6M18 9.2c0 4.5-7 3.5-11.2 7.8" />
      </Glyph>
      {!compact && <span className="text-fg">{status.branch || "detached"}</span>}
      {status.behind > 0 && (
        <span className="text-accent-ink" title={`${status.behind} to pull`}>
          ↓{status.behind}
        </span>
      )}
      {/* Not in the reference, which never has anything unpushed: a commit
          made in a terminal and not yet pushed is work a sync would carry. */}
      {status.ahead > 0 && <span title={`${status.ahead} to push`}>↑{status.ahead}</span>}
      {changed > 0 && (
        <span className="text-warn flex items-center gap-1.5" title={`${changed} changed`}>
          <span className="bg-warn size-1.5 rounded-full" aria-hidden />
          {changed}
        </span>
      )}
      {synced && <span className="text-ok">synced</span>}
    </button>
  );
}

/**
 * What each action will do, before it does it.
 *
 * Not ceremony: a push cannot be taken back from here, and a rebase that stops
 * halfway leaves a conflicted worktree that a web page has no business asking
 * anybody to resolve.
 */
function Popover({
  tab,
  onTab,
  status,
  onStatus,
  onClose,
  anchor,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  status: GitStatus;
  onStatus: (status: GitStatus) => void;
  onClose: () => void;
  anchor: React.RefObject<HTMLDivElement | null>;
}) {
  const [message, setMessage] = useState(() => proposeMessage(status.changes));
  // Acting, as opposed to the read Incoming does on opening. Two states because
  // the button names what it is doing, and "Pulling…" during a fetch would name
  // the wrong thing.
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The name a rescue would use, offered by the server with the failure that
  // needs it.
  const [proposed, setProposed] = useState<string | null>(null);
  // A rescue is the one success worth staying open for: the branch name is the
  // whole point of it, and closing would take away the only place it is
  // written down.
  const [rescued, setRescued] = useState<string | null>(null);

  const toast = useToast();

  // Escape, and a press anywhere outside the pill and the popover, close it.
  useEscape(onClose);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose, anchor]);

  // Incoming previews what is actually there, which means asking the remote.
  // That is the one network read, and showing the tab is what asks for it —
  // once per opening, however often you switch back to it.
  const fetched = useRef(false);
  useEffect(() => {
    if (tab !== "incoming" || fetched.current) return;
    fetched.current = true;
    setFetching(true);
    api
      .gitFetch()
      .then((r) => onStatus(r.status))
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setFetching(false));
  }, [tab, onStatus]);

  /** Runs an action. Done, the popover has nothing left to say, so it goes
   *  and the toast says what happened; a rescue stays, since the branch name
   *  it shows is the point. */
  const act = async (run: () => Promise<GitResult>, done: string, rescue?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      onStatus(result.status);
      if (rescue) setRescued(rescue);
      else {
        toast(done);
        onClose();
      }
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

  const changed = status.changes.length;
  // A sync with nothing staged is a push, and says so: asking to "commit and
  // push" when no commit is coming describes the wrong action.
  const nothingToPush = changed === 0 && status.ahead === 0;

  return (
    <div
      role="dialog"
      aria-label="Source control"
      className="bg-elev shadow-float animate-wv-in absolute top-[58px] right-3 z-60 w-[min(410px,calc(100vw-24px))] overflow-hidden rounded-[14px]"
    >
      <header className="flex items-center gap-2.5 pt-3.5 pr-3.5 pb-3 pl-4">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Source control</div>
          <div className="text-faint mt-0.5 truncate font-mono text-xs">
            {status.branch || "detached"} ⇄ {status.remote}
          </div>
        </div>
        <IconButton label="Close" size="xs" onClick={onClose}>
          <Glyph size={15}>
            <path d="M18 6L6 18M6 6l12 12" />
          </Glyph>
        </IconButton>
      </header>

      <div role="tablist" className="bg-panel-2 mx-3.5 grid grid-cols-2 gap-1 rounded-[9px] p-[3px]">
        {(
          [
            ["incoming", "Incoming", status.behind],
            ["changes", "Changes", changed],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={[
              "flex h-7.5 items-center justify-center gap-1.5 rounded-[7px] font-medium",
              tab === id ? "bg-elev text-fg" : "text-muted hover:text-fg",
            ].join(" ")}
          >
            {label} <span className="text-faint font-mono text-[11px]">{n}</span>
          </button>
        ))}
      </div>

      <div className="max-h-[70vh] space-y-3 overflow-y-auto px-3.5 pt-3 pb-3.5 text-[13px]">
        {tab === "incoming" ? (
          <>
            <p className="text-muted mx-0.5">
              {fetching && !error
                ? "Asking the remote what it has…"
                : status.behind === 0
                  ? `${status.branch || "This branch"} is level with ${status.remote}.`
                  : `${status.behind} commit${status.behind === 1 ? "" : "s"} to take, rebasing your ${status.ahead} on top.`}
            </p>
            <ul className="border-line max-h-60 overflow-y-auto rounded-[10px] border">
              {status.incoming.map((c) => (
                <li
                  key={c.sha}
                  className="border-line grid grid-cols-[64px_1fr_auto] items-center gap-2.5 border-b px-3 py-2 last:border-b-0"
                >
                  <span className="text-accent-ink font-mono text-[11.5px]">{c.sha}</span>
                  <span className="truncate" title={c.subject}>
                    {c.subject}
                  </span>
                  <span className="text-faint text-xs whitespace-nowrap">
                    {c.author} · {age(c.when)}
                  </span>
                </li>
              ))}
              {status.behind > status.incoming.length && status.incoming.length > 0 && (
                <li className="text-faint px-3 py-2 text-xs">
                  and {status.behind - status.incoming.length} more
                </li>
              )}
              {status.behind === 0 && !fetching && (
                <li className="text-faint p-4.5 text-center">Nothing to pull. You're up to date.</li>
              )}
            </ul>

            {/* The way out of a failed pull. The local work is intact and still
                local; this puts it somewhere else so the conflict can be
                resolved with a real tool on a real checkout. */}
            {proposed && (
              <div className="border-line space-y-2 rounded-[10px] border p-3">
                <p className="text-muted text-xs">
                  Your work is untouched. Push it to a branch and resolve this where you have a
                  terminal.
                </p>
                <input
                  value={proposed}
                  onChange={(e) => setProposed(e.target.value)}
                  aria-label="Branch name"
                  className="border-line-2 bg-panel-2 focus:border-accent h-8 w-full rounded-lg border px-2.5 font-mono text-xs outline-none"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => api.gitBranch(proposed), "Pushed to " + proposed, proposed)}
                  className="border-line-2 text-fg hover:bg-fg/5 h-8 w-full rounded-lg border text-xs disabled:opacity-50"
                >
                  Push to this branch
                </button>
              </div>
            )}
            {rescued && !error && (
              <p>
                Your work is on <span className="font-mono text-xs">{rescued}</span>. Resolve the
                conflict where you have a terminal.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-muted mx-0.5">
              {nothingToPush
                ? "Nothing to sync: no changes here and nothing waiting to push."
                : `${changed} file${changed === 1 ? "" : "s"} to commit, ${status.ahead} commit${status.ahead === 1 ? "" : "s"} to push.`}
            </p>
            {/* Everything that would be committed, including work somebody else
                did: an agent editing alongside is the expected case, and a
                preview that hid its files would misdescribe the button. */}
            <ul className="border-line max-h-48 overflow-y-auto rounded-[10px] border">
              {status.changes.map((c) => (
                <li
                  key={c.path}
                  className="border-line flex items-center gap-2.5 border-b px-3 py-2 font-mono text-xs last:border-b-0"
                >
                  <span className="bg-warn/15 text-warn grid size-4.5 shrink-0 place-items-center rounded-[5px] text-[10.5px] font-semibold">
                    {changeLetter(c.code)}
                  </span>
                  <span className="truncate">{c.path}</span>
                </li>
              ))}
              {changed === 0 && <li className="text-faint p-4.5 text-center">Working tree clean.</li>}
            </ul>
            {/* Staged work this sync will step around. Said because it is not
                going to happen: somebody who staged files in a terminal and
                then pressed a button called "commit and push" has every
                reason to think both got committed. Only alongside a commit,
                since that is the sentence's subject. */}
            {changed > 0 && status.outside > 0 && (
              <p className="text-warn bg-warn/8 border-warn/25 rounded-lg border px-2.5 py-2 text-xs">
                {status.outside} staged file{status.outside === 1 ? "" : "s"} elsewhere in this
                repository {status.outside === 1 ? "is" : "are"} outside the bundle, and will not be
                committed. Handle {status.outside === 1 ? "it" : "them"} in a terminal.
              </p>
            )}
            {/* Only when something would be committed: asking for a message for
                a commit that is not happening is a box to dismiss on the way
                to a push. */}
            {changed > 0 && (
              <label className="block">
                <span className="text-muted mx-0.5 mb-1.5 block text-xs font-medium">Commit message</span>
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-label="Commit message"
                  className="border-line-2 bg-panel-2 focus:border-accent h-9 w-full rounded-[9px] border px-3 outline-none"
                />
              </label>
            )}
          </>
        )}

        {error && <p className="text-danger">{error}</p>}

        <div className="flex items-center gap-2">
          <span className="text-faint flex-1 text-xs">
            {tab === "changes" && `${status.ahead} commit${status.ahead === 1 ? "" : "s"} ahead`}
          </span>
          {tab === "incoming" ? (
            <Primary
              disabled={busy || fetching || status.behind === 0}
              onClick={() => act(() => api.gitPull(), `Pulled ${count(status.behind, "commit")}`)}
            >
              {busy && !proposed ? "Pulling…" : "Pull & rebase"}
            </Primary>
          ) : (
            <Primary
              disabled={busy || nothingToPush}
              onClick={() =>
                act(
                  () => api.gitSync(message),
                  changed > 0 ? `Committed ${count(changed, "file")} and pushed` : `Pushed ${count(status.ahead, "commit")}`,
                )
              }
            >
              {busy ? "Pushing…" : changed > 0 ? "Commit & push" : "Push"}
            </Primary>
          )}
        </div>
      </div>
    </div>
  );
}

/** The accent button that does the thing. Inert when there is nothing to do,
 *  rather than offering a button whose only outcome is saying it did nothing. */
function Primary({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="bg-accent text-on-accent h-8.5 rounded-[9px] px-4 font-semibold hover:brightness-110 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Git's two-letter status as the one letter a row has room for. Untracked is
 *  "?" and anything else is its first non-blank column. */
function changeLetter(code: string): string {
  if (code === "??") return "?";
  return code.trim()[0] ?? "M";
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
