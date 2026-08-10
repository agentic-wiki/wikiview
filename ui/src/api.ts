// The server's shape, mirrored. Every field here has a counterpart in
// internal/server; if one drifts the other should be changed with it.

export interface BundleInfo {
  dir: string;
  spec: string;
  entries: number;
  tools: string[];
  version: number;
}

/**
 * A link as written, alongside where it resolves to.
 *
 * `raw` is the lookup key: it is the href exactly as the markdown renderer will
 * encounter it. Resolving a link means finding it in this table, never doing
 * path arithmetic against the bundle root — that is the engine's rule, and
 * redoing it here is how the previous attempt ended up with three copies of it.
 */
export interface Link {
  raw: string;
  to: string;
  anchor: string;
  text: string;
  line: number;
  /** False when the target names no entry. Not an error: it may be unwritten. */
  exists: boolean;
}

export interface Backlink {
  from: string;
  text: string;
  line: number;
}

/** Ids come from the server because every markdown library slugs differently. */
export interface Heading {
  level: number;
  text: string;
  id: string;
  line: number;
}

/** Keyed by line: text repeats, and the line is what a write addresses. */
export interface Checkbox {
  line: number;
  done: boolean;
  text: string;
}

export interface Entry {
  path: string;
  type: string;
  frontmatter: Record<string, unknown>;
  /** The markdown as written. The only representation of the content. */
  body: string;
  links: Link[];
  backlinks: Backlink[];
  headings: Heading[];
  checkboxes: Checkbox[];
}

export interface EntryStub {
  path: string;
  name: string;
  type: string;
  title?: string;
}

export interface TreeNode {
  path: string;
  name: string;
  /** The folder's own index.md, absent when it has none. */
  index?: string;
  entries: EntryStub[];
  children: TreeNode[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) {
    // The server answers errors as JSON; fall back to the status when whatever
    // replied was not the server.
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  bundle: (signal?: AbortSignal) => get<BundleInfo>("/api/bundle", signal),
  tree: (signal?: AbortSignal) => get<TreeNode>("/api/tree", signal),
  entry: (path: string, signal?: AbortSignal) =>
    // The path is carried verbatim, `.md` and all, because it *is* the bundle
    // path. Each segment is encoded so a name with a space or a '#' survives.
    get<Entry>(
      "/api/entry/" + path.replace(/^\//, "").split("/").map(encodeURIComponent).join("/"),
      signal,
    ),
};

/**
 * Subscribes to change notifications.
 *
 * The stream carries a version and never a payload, so this reports staleness
 * rather than delivering content: a client that missed ten events refetches once
 * and is correct again. Returns an unsubscribe function.
 */
export function onVersion(handler: (version: number) => void): () => void {
  const source = new EventSource("/api/events");
  const listener = (e: MessageEvent) => {
    const v = Number(e.data);
    if (Number.isFinite(v)) handler(v);
  };
  source.addEventListener("version", listener);
  return () => {
    source.removeEventListener("version", listener);
    source.close();
  };
}
