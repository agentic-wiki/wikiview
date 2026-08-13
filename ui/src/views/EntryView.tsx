import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type Entry } from "@/api";
import { isCurrent, recall, remember } from "@/cache";
import { Markdown } from "@/markdown/Markdown";
import { NotFound } from "@/views/NotFound";
import { Loading } from "@/views/Loading";

export function EntryView({
  path,
  version,
  refresh,
  changedAt,
  destination = (bundlePath) => "/wiki" + bundlePath,
  queued,
  onQueue,
}: {
  path: string;
  version: number;
  refresh: number;
  /** Whether this entry is in the read-later queue. */
  queued: boolean;
  /** Puts it in, or takes it out. */
  onQueue: () => void;
  /** The version this entry's content last moved at, from the tree. Undefined
   *  for a path the tree does not list, which is a reason to fetch rather than
   *  to trust a copy. */
  changedAt?: number;
  /**
   * Where a link to a bundle path should go, for *every* link this view draws:
   * the body, the frontmatter references, the backlinks.
   *
   * A board overrides it, so following something that is already on the board
   * opens that card instead of throwing away the board you were reading it on.
   * The reader leaves it alone and stays in the reader — which is why this is the
   * caller's rule rather than this view's: only the caller knows what is on
   * screen behind the entry.
   *
   * It used to reach the body alone, so one card obeyed the board in its prose
   * and left for the reader from a `blockers` chip: three link surfaces in one
   * view, one of which asked.
   */
  destination?: (bundlePath: string) => string;
}) {
  // What is on screen, and which path it is. The two travel together because
  // the fetch below is what makes them agree, and until it lands they do not:
  // the outgoing entry stays rendered while the incoming one is in flight.
  //
  // That is deliberate. Blanking instead would be honest for the few
  // milliseconds a local read takes, and it would cost the whole layout: the
  // view collapses to nothing, so the browser clamps the scroll position to
  // zero, and the restored position for a back navigation is lost before the
  // content that could hold it exists. A brief stale render is cheaper than a
  // reader that cannot go back.
  const [loaded, setLoaded] = useState<{ path: string; entry: Entry } | null>(null);
  const [error, setError] = useState<{ path: string; message: string } | null>(null);

  useEffect(() => {
    // A copy taken at or after the version this entry last moved at *is* the
    // file, so there is nothing to ask for. This is the common case in a
    // session: most navigation revisits, and most versions move because of some
    // other entry — which is exactly when a bundle-wide check would refetch
    // everything for nothing.
    if (isCurrent(path, changedAt)) {
      setError(null);
      return;
    }
    const ac = new AbortController();
    api
      .entry(path, ac.signal)
      .then((e) => {
        if (!ac.signal.aborted) {
          remember(path, e, version);
          setLoaded({ path, entry: e });
          setError(null);
        }
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError({ path, message: String(e.message ?? e) });
      });
    return () => ac.abort();
  }, [path, refresh, changedAt, version]);

  // The entry this path is showing, read during render so one visited earlier is
  // on screen in the same commit as the navigation rather than a frame after it.
  // Undefined until a first visit lands, which is when the outgoing entry below
  // keeps the layout — and its scroll position — from collapsing.
  const shown = loaded?.path === path ? loaded.entry : recall(path)?.entry;
  const entry = shown ?? loaded?.entry ?? null;

  const toggle = useCallback(
    async (line: number, done: boolean) => {
      // A checkbox belongs to the entry it was rendered from. While a first
      // visit is in flight that entry is not the one at `path`, and a line
      // number means nothing across two files.
      if (!shown) return;
      // Applied optimistically, then confirmed by the refetch the version bump
      // triggers. A refused write leaves this correction visible only until that
      // refetch replaces it with the truth.
      //
      // Kept as well as shown: without that, navigating away and back would
      // render the copy taken *before* the tick and read as the write having
      // failed.
      const next = {
        ...shown,
        checkboxes: shown.checkboxes.map((c) => (c.line === line ? { ...c, done } : c)),
      };
      remember(path, next, version);
      setLoaded({ path, entry: next });
      try {
        await api.setCheckbox(path, line, done, version);
      } catch (err) {
        // A conflict means the file moved underneath: refetch rather than retry,
        // because the line number this was addressed by may no longer mean the
        // same thing.
        setError({ path, message: String((err as Error).message) });
        api
          .entry(path)
          .then((fresh) => {
            remember(path, fresh, version);
            setLoaded({ path, entry: fresh });
          })
          .catch(() => {});
      }
    },
    [shown, path, version],
  );

  // A missing entry is not an error in this format: a link may point at
  // knowledge not yet written. It gets a placeholder, not a stack of red text.
  // Only the current path's failure counts — a 404 left over from an entry you
  // have already navigated away from is not about this one.
  if (error?.path === path) {
    return <NotFound path={path} hint="There is no entry here yet" />;
  }
  if (!entry) return <Loading />;

  return (
    <article className="mx-auto max-w-3xl px-6 py-8">
      {/* Both floats, in source order right to left: printing is the older
          affordance and keeps the corner. Each floats on its own rather than
          sharing a wrapper, for the reason the print button was floated in the
          first place — see below. */}
      <Print />
      <QueueButton queued={queued} onQueue={onQueue} />
      <Frontmatter entry={entry} destination={destination} />
      {/* Below the frontmatter strip, where the body's own opening heading would
          sit — so an entry that has one and an entry that borrows one look the
          same, and the strip stays metadata above the content rather than
          something wedged between a title and its text.

          Only when the body does not already name itself, with a heading or with
          an opening line that says the same words: unconditionally would show
          the title twice, never would leave a prose-first entry unnamed. */}
      {!alreadyNamed(entry) && (
        <h1 className="text-fg mb-4 text-2xl font-semibold tracking-tight">{entry.title}</h1>
      )}
      <Markdown entry={entry} onToggleCheckbox={toggle} destination={destination} />
      <Backlinks entry={entry} destination={destination} />
    </article>
  );
}

/**
 * Whether the body already announces what the entry is called.
 *
 * Two ways it can, and both mean a prepended title would be a repetition the
 * author did not write. Whether a line is a heading comes from the headings
 * table rather than from parsing the markdown again — the engine already said
 * where every heading is, and a second opinion about what counts as one is the
 * duplication this API shape exists to avoid.
 */
function alreadyNamed(entry: Entry): boolean {
  const lines = entry.body.split("\n");
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first < 0) return true; // an empty body has nothing to sit above

  // The body opens with a heading of its own, whatever it says. Adding a title
  // above it would give the entry two headings, one of which nobody wrote.
  if (entry.headings.some((h) => h.bodyLine === first + 1)) return true;

  // Or the first line already says the title in prose — "**A markdown reader by
  // default.**" under a title about the reader. Compared loosely, on lowercase
  // and stripped of markdown emphasis, because the question is whether a reader
  // would see the same words twice, not whether the strings match.
  const opening = lines[first]!.toLowerCase().replace(/[*_`#>]/g, "").trim();
  const title = entry.title.toLowerCase().trim();
  return title.length > 0 && opening.includes(title);
}

/**
 * Frontmatter as a compact strip rather than a raw YAML block. It is metadata,
 * and the raw form is only interesting when editing — which this is not, yet.
 */
function Frontmatter({
  entry,
  destination,
}: {
  entry: Entry;
  destination: (bundlePath: string) => string;
}) {
  // title is already the heading; okf_version is the format's bookkeeping and
  // says nothing about the entry.
  const fields = Object.entries(entry.frontmatter).filter(
    ([k]) => k !== "title" && k !== "okf_version",
  );
  if (fields.length === 0) return null;

  // Values that name an entry, keyed the way they are written so a lookup
  // replaces any guessing about what looks like a path.
  const refs = new Map(entry.frontmatterRefs.map((r) => [r.key + "\u0000" + r.value, r]));

  return (
    // The rule sits on a plain block and the chips on a flex one inside it,
    // which is what gets the divider all the way across. A flex container
    // establishes its own formatting context, so it steps aside from the floated
    // print button and its border stops short by exactly the button's width. An
    // ordinary block does not: only its line boxes avoid the float, while its
    // border box still spans the full column.
    <div className="border-border mb-6 border-b pb-4">
      <dl className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      {fields.map(([key, value]) => (
        // Key and value read as one unit, so they share a chip and the accent
        // separates them rather than a gap doing it. Values are never coloured
        // by meaning: the vocabulary belongs to the bundle, and tinting
        // `status: done` green would be the reader having an opinion about
        // words it was only asked to display.
        <div
          key={key}
          className="border-border/70 bg-surface/60 flex items-baseline gap-1.5 rounded-md border px-2 py-0.5"
        >
          {/* The key is muted rather than accented. Accent now means "this is
              interactive" — a resolving value is a link — and one colour cannot
              also mean "this is a key" without the two becoming unreadable
              together. Hierarchy comes from tone, interactivity from hue. */}
          <dt className="text-muted font-medium">{key}</dt>
          <dd className="text-fg flex items-baseline gap-1.5">
            {values(value).map((v, i) => {
              const ref = refs.get(key + "\u0000" + v);
              return ref ? (
                <Link
                  key={i}
                  to={destination(ref.to)}
                  className="text-accent underline decoration-1 underline-offset-2"
                  title={ref.value}
                >
                  {ref.label}
                </Link>
              ) : (
                <span key={i}>{v}</span>
              );
            })}
          </dd>
        </div>
      ))}
      </dl>
    </div>
  );
}

/** A scalar and a list are the same thing here, one of them repeated — which is
 *  how the format treats a frontmatter reference too. */
function values(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

/** Named for what the engine calls it. `wiki backlinks` is the command, so the UI
 *  using a different word for the same thing would be one more translation to
 *  hold in your head. */
function Backlinks({
  entry,
  destination,
}: {
  entry: Entry;
  destination: (bundlePath: string) => string;
}) {
  if (entry.backlinks.length === 0) return null;
  return (
    <section className="border-border mt-12 border-t pt-6">
      <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
        Backlinks ({entry.backlinks.length})
      </h2>
      <ul className="mt-3 space-y-1">
        {entry.backlinks.map((b, i) => (
          <li key={`${b.from}:${b.line}:${i}`}>
            <Link
              to={destination(b.from)}
              className="hover:bg-fg/[0.04] flex items-baseline gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <span className="text-fg truncate">{b.title || b.from}</span>
              <span className="text-muted ml-auto shrink-0 font-mono text-xs">
                {b.from}:{b.line}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Print this entry.
 *
 * A real float rather than a position, because it has nothing dependable to
 * attach to: the frontmatter strip is absent on an entry with no metadata, and
 * the title is absent whenever the body already names itself. Floated, it
 * attaches to no element at all — whatever happens to come first flows around
 * it, and it can never overlap the thing it sits beside.
 *
 * `window.print()` and nothing else. The browser already turns a page into a
 * PDF, and everyone already knows ⌘P; this only says so on screen for the people
 * who do not.
 */
function Print() {
  return (
    <button
      type="button"
      data-print="hide"
      onClick={() => window.print()}
      aria-label="Print this entry"
      title="Print"
      className="text-muted hover:text-fg hover:bg-fg/5 float-right ml-3 rounded-md p-1.5"
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
        <path d="M6 9V3h12v6" />
        <path d="M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" />
        <path d="M6 14h12v7H6z" />
      </svg>
    </button>
  );
}

/**
 * Save this entry to read later.
 *
 * Here, on the entry, because this is the moment the thought happens: you are
 * reading something that matters and cannot read it now. It rides along into the
 * card sheet for free, since a card is this view inside a dialog — and a board
 * you could save nothing from would be a hole in the feature rather than a
 * decision.
 *
 * The bookmark filled when it is saved, hollow when it is not: the same glyph the
 * rail and the tree use, in the two states there are.
 */
function QueueButton({ queued, onQueue }: { queued: boolean; onQueue: () => void }) {
  return (
    <button
      type="button"
      data-print="hide"
      onClick={onQueue}
      aria-pressed={queued}
      aria-label={queued ? "Remove from read later" : "Save to read later"}
      title={queued ? "Saved to read later — click to remove" : "Read later"}
      className={[
        "hover:bg-fg/5 float-right ml-3 rounded-md p-1.5",
        queued ? "text-accent" : "text-muted hover:text-fg",
      ].join(" ")}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill={queued ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M7 4h10v16l-5-4-5 4z" />
      </svg>
    </button>
  );
}
