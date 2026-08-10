import { useEffect, useState } from "react";
import { api, type Entry } from "@/api";

/** Placeholder until the markdown pipeline lands: proves the data arrives and
 *  that a version bump refetches what is on screen. */
export function EntryView({ path, version }: { path: string; version: number }) {
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
  }, [path, version]);

  if (error) return <p className="text-muted p-6 text-sm">{error}</p>;
  if (!entry) return <p className="text-muted p-6 text-sm">Loading…</p>;

  return (
    <article className="mx-auto max-w-3xl p-6">
      <h1 className="text-fg text-xl font-semibold">
        {String(entry.frontmatter.title ?? entry.path)}
      </h1>
      <p className="text-muted mt-1 text-xs">
        {entry.type && <span>{entry.type}</span>}
        {entry.headings.length > 0 && <span> · {entry.headings.length} headings</span>}
        {entry.links.length > 0 && <span> · {entry.links.length} links</span>}
        {entry.checkboxes.length > 0 && <span> · {entry.checkboxes.length} checkboxes</span>}
      </p>
      <pre className="text-fg mt-6 text-sm whitespace-pre-wrap">{entry.body}</pre>
    </article>
  );
}
