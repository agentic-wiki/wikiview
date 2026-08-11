import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type Entry } from "@/api";
import { Markdown } from "@/markdown/Markdown";

export function EntryView({
  path,
  version,
  refresh,
}: {
  path: string;
  version: number;
  refresh: number;
}) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setError(null);
    api
      .entry(path, ac.signal)
      .then(setEntry)
      .catch((e) => {
        if (!ac.signal.aborted) setError(String(e.message ?? e));
      });
    return () => ac.abort();
  }, [path, refresh]);

  const toggle = useCallback(
    async (line: number, done: boolean) => {
      if (!entry) return;
      // Applied optimistically, then confirmed by the refetch the version bump
      // triggers. A refused write leaves this correction visible only until that
      // refetch replaces it with the truth.
      setEntry({
        ...entry,
        checkboxes: entry.checkboxes.map((c) => (c.line === line ? { ...c, done } : c)),
      });
      try {
        await api.setCheckbox(path, line, done, version);
      } catch (e) {
        // A conflict means the file moved underneath: refetch rather than retry,
        // because the line number this was addressed by may no longer mean the
        // same thing.
        setError(String((e as Error).message));
        api.entry(path).then(setEntry).catch(() => {});
      }
    },
    [entry, path, version],
  );

  if (error && !entry) return <p className="text-muted p-6 text-sm">{error}</p>;
  if (!entry) return <p className="text-muted p-6 text-sm">Loading…</p>;

  return (
    <article className="mx-auto max-w-3xl px-6 py-8">
      <Frontmatter entry={entry} />
      <Markdown entry={entry} onToggleCheckbox={toggle} />
      <Backlinks entry={entry} />
    </article>
  );
}

/**
 * Frontmatter as a compact strip rather than a raw YAML block. It is metadata,
 * and the raw form is only interesting when editing — which this is not, yet.
 */
function Frontmatter({ entry }: { entry: Entry }) {
  const fields = Object.entries(entry.frontmatter).filter(([k]) => k !== "title" && k !== "okf_version");
  if (fields.length === 0) return null;

  return (
    <dl className="border-border mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-b pb-4 text-xs">
      {fields.map(([key, value]) => (
        <div key={key} className="flex items-center gap-1.5">
          <dt className="text-muted">{key}</dt>
          <dd className="text-fg">{format(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function format(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function Backlinks({ entry }: { entry: Entry }) {
  if (entry.backlinks.length === 0) return null;
  return (
    <section className="border-border mt-12 border-t pt-6">
      <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
        Linked mentions ({entry.backlinks.length})
      </h2>
      <ul className="mt-3 space-y-1">
        {entry.backlinks.map((b, i) => (
          <li key={`${b.from}:${b.line}:${i}`}>
            <Link
              to={"/wiki" + b.from}
              className="hover:bg-fg/[0.04] group flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <span className="text-fg truncate">{b.text || b.from}</span>
              <span className="text-muted ml-auto shrink-0 text-xs">
                {b.from}:{b.line}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
