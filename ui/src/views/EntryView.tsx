import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type Entry } from "@/api";
import { Markdown } from "@/markdown/Markdown";
import { NotFound } from "@/views/NotFound";
import { Loading } from "@/views/Loading";

export function EntryView({
  path,
  version,
  refresh,
}: {
  path: string;
  version: number;
  refresh: number;
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
    const ac = new AbortController();
    api
      .entry(path, ac.signal)
      .then((e) => {
        if (!ac.signal.aborted) {
          setLoaded({ path, entry: e });
          setError(null);
        }
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError({ path, message: String(e.message ?? e) });
      });
    return () => ac.abort();
  }, [path, refresh]);

  const entry = loaded?.entry ?? null;

  const toggle = useCallback(
    async (line: number, done: boolean) => {
      // A checkbox belongs to the entry it was rendered from. While a
      // navigation is in flight that entry is not the one at `path`, and a line
      // number means nothing across two files.
      if (!loaded || loaded.path !== path) return;
      // Applied optimistically, then confirmed by the refetch the version bump
      // triggers. A refused write leaves this correction visible only until that
      // refetch replaces it with the truth.
      const e = loaded.entry;
      setLoaded({
        path,
        entry: { ...e, checkboxes: e.checkboxes.map((c) => (c.line === line ? { ...c, done } : c)) },
      });
      try {
        await api.setCheckbox(path, line, done, version);
      } catch (err) {
        // A conflict means the file moved underneath: refetch rather than retry,
        // because the line number this was addressed by may no longer mean the
        // same thing.
        setError({ path, message: String((err as Error).message) });
        api
          .entry(path)
          .then((fresh) => setLoaded({ path, entry: fresh }))
          .catch(() => {});
      }
    },
    [loaded, path, version],
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
      <Frontmatter entry={entry} />
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
      <Markdown entry={entry} onToggleCheckbox={toggle} />
      <Backlinks entry={entry} />
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
function Frontmatter({ entry }: { entry: Entry }) {
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
    <dl className="border-border mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b pb-4 text-xs">
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
                  to={"/wiki" + ref.to}
                  className="text-accent underline decoration-1 underline-offset-2"
                  title={ref.value}
                >
                  {ref.title}
                </Link>
              ) : (
                <span key={i}>{v}</span>
              );
            })}
          </dd>
        </div>
      ))}
    </dl>
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
function Backlinks({ entry }: { entry: Entry }) {
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
              to={"/wiki" + b.from}
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
