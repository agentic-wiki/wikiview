// The server's shape, mirrored. Every field here has a counterpart in
// internal/server; if one drifts the other should be changed with it.

export interface BundleInfo {
  /** Scopes anything this browser remembers, so preferences never leak between
   *  bundles. Computed by the server: identity has one definition. */
  id: string;
  /** The bundle's folder made readable, named by the rule that names entries. */
  label: string;
  dir: string;
  spec: string;
  entries: number;
  tools: string[];
  version: number;
  /** Boards declared in `[tool.wikiview]`, with their defaults filled in.
   *  Absent when the bundle declares none, which is the common case. */
  boards?: BoardConfig[];
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
  /** Where to fetch a target that is not an entry, absent when there is none. */
  asset?: string;
  /**
   * True when the link resolves above the bundle root. `to` is empty for these.
   *
   * Reported so the client never has to guess what an unknown href means. Left
   * as a plain anchor, the browser resolves the relative path against the
   * current route and a click becomes a full page load into an address the app
   * does not serve.
   */
  outside: boolean;
}

/**
 * A link pointing at this entry.
 *
 * `title` is the *linking* entry's own title — which entry mentions this one.
 * `text` is the words it used, which is a different thing: a link is usually
 * labelled with its target's name, so showing the text alone reads as this
 * page's own name.
 */
export interface Backlink {
  from: string;
  title: string;
  text: string;
  line: number;
}

/**
 * Positions arrive in two coordinate systems, and using the wrong one fails
 * silently: `line` counts from the top of the *file* including frontmatter and
 * is what a write is addressed by; `bodyLine` counts within `body` as served,
 * which is what a renderer of that body can match against.
 */
interface Positioned {
  line: number;
  bodyLine: number;
}

/** Ids come from the server because every markdown library slugs differently. */
export interface Heading extends Positioned {
  level: number;
  text: string;
  id: string;
}

export interface Checkbox extends Positioned {
  done: boolean;
  text: string;
}

/**
 * A frontmatter value that names an entry in this bundle.
 *
 * Which fields these are is not fixed: `blockers` and `epic` are conventions, and
 * any field whose value resolves is one. The client looks a value up here rather
 * than deciding for itself what looks like a path.
 */
export interface Ref {
  key: string;
  value: string;
  to: string;
  /** The target's filename made readable, the same name the tree gives it. */
  label: string;
}

export interface Entry {
  path: string;
  /** The entry's title, or a readable name from its filename. Always present. */
  title: string;
  type: string;
  frontmatter: Record<string, unknown>;
  /** The markdown as written. The only representation of the content. */
  body: string;
  links: Link[];
  frontmatterRefs: Ref[];
  backlinks: Backlink[];
  headings: Heading[];
  checkboxes: Checkbox[];
}

export interface EntryStub {
  path: string;
  name: string;
  type: string;
  /**
   * The filename made readable, and what navigation shows: "003-watch-and-events.md"
   * becomes "Watch and events". You arrived at a file, so the tree and the
   * breadcrumb name the file.
   */
  label: string;
  /**
   * What the entry calls itself, absent when it carries no `title`. Shown on its
   * own page, and matched by search so an entry is findable by either name.
   */
  title?: string;
  /** The bundle version this entry's content last moved at. Compared against the
   *  version you last saw it at, which is what marks it as changed. */
  changedAt: number;
}

export interface TreeNode {
  path: string;
  name: string;
  /** `name` made readable, by the rule that names entries. Absent for the root,
   *  which has no name of its own. */
  label?: string;
  /** The folder's own index.md, absent when it has none. */
  index?: string;
  entries: EntryStub[];
  children: TreeNode[];
}

/**
 * A board a bundle declares in `[tool.wikiview]`, beyond the built-in `root`.
 */
export interface BoardConfig {
  path: string;
  /** What the URL carries, and what tells two boards over one folder apart.
   *  Declared in the config, never derived from the path. */
  id: string;
  /** What to call it on screen: the config's name, or the folder made readable. */
  name: string;
  where?: string[];
  status: string;
  columns?: string[];
  lane?: string;
}

export interface Card {
  path: string;
  label: string;
  title?: string;
  type?: string;
  /** This card's value for the board's lane field, absent when it has none. */
  lane?: string;
}

export interface Column {
  /** The status this column holds; empty for cards carrying none. */
  value: string;
  /** True for a column the config declares, false for one that exists only
   *  because an entry has that status. Renaming the status makes the second
   *  vanish and leaves the first empty, so they cannot look the same. */
  pinned: boolean;
  cards: Card[];
}

/** A frontmatter key the board's folder uses, and what it holds. */
export interface Field {
  key: string;
  /** The distinct values, absent for a key with too many to be a choice — a
   *  title has as many as there are entries. */
  values?: string[];
  /** True for a key holding a list. It filters — `tags=bug` matches on
   *  membership — and does not group, since a column or a lane is one value. */
  list?: boolean;
}

/** What a board's settings form owns. Not `id` or `path`: those are what the
 *  board is, and changing an id breaks every link to it. */
export interface BoardSettings {
  name: string;
  status: string;
  lane: string;
  where: string[];
  columns: string[];
}

/**
 * One folder stacked into columns.
 *
 * Assembled by the server, which already has the config decoded and the `where`
 * filters parsed. Rebuilding it here would mean a request per card just to read
 * each entry's status, and a second implementation of the column rules.
 */
export interface Board {
  path: string;
  id: string;
  name: string;
  /** The frontmatter field the columns are made of. */
  field: string;
  /** The field rows group by, absent when the board has no lanes. */
  lane?: string;
  /** The filter deciding which entries are cards, in the `--where` spelling. */
  where: string[];
  columns: Column[];
  /** The frontmatter keys the board's folder uses, so choosing a field or a
   *  filter is picking from what is there. Taken before the board's own filter,
   *  which is the filter you would be replacing. */
  fields: Field[];
  /** False for the built-in `root`, which no config mentions. */
  declared: boolean;
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

const put = <T,>(path: string, body: unknown) => write<T>("PUT", path, body);
const post = <T,>(path: string, body: unknown) => write<T>("POST", path, body);

async function write<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new ApiError(res.status, b?.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

const encode = (path: string) =>
  path.replace(/^\//, "").split("/").map(encodeURIComponent).join("/");

export const api = {
  bundle: (signal?: AbortSignal) => get<BundleInfo>("/api/bundle", signal),
  tree: (signal?: AbortSignal) => get<TreeNode>("/api/tree", signal),
  board: (path: string, signal?: AbortSignal) => get<Board>("/api/board/" + encode(path), signal),
  entry: (path: string, signal?: AbortSignal) =>
    // The path is carried verbatim, `.md` and all, because it *is* the bundle
    // path. Each segment is encoded so a name with a space or a '#' survives.
    get<Entry>("/api/entry/" + encode(path), signal),

  /**
   * Toggles a checkbox.
   *
   * The version travels with the write because the request is addressed by
   * *line*, and a line only means something against the content it was read
   * from. If the entry changed underneath, line 12 may be a different checkbox
   * or none at all, so the server refuses and this refetches.
   */
  setCheckbox: (path: string, line: number, done: boolean, version: number) =>
    put<{ version: number }>("/api/checkbox/" + encode(path), { line, done, version }),

  /**
   * Moves a card to another column.
   *
   * The column's value, not the field it is stored in: the board says which
   * frontmatter key its columns are made of, and it says so on the server where
   * the config is parsed. Same version guard as a checkbox, refused the same way.
   */
  moveCard: (board: string, path: string, value: string, version: number) =>
    put<{ version: number }>("/api/card/" + encodeURIComponent(board) + "/" + encode(path), {
      value,
      version,
    }),

  /**
   * Declares a board, by appending it to the bundle's `wiki.toml`.
   *
   * No version guard, unlike the writes above: those are addressed by something
   * that only means anything against the content it was read from, and this
   * appends a board that did not exist.
   */
  declareBoard: (board: { id: string; path: string; name: string }) =>
    post<{ version: number }>("/api/board", board),

  /**
   * Changes what a board is: its filter, its fields, its columns.
   *
   * All of them at once rather than one key at a time, because clearing a
   * setting is how you say a board has no lanes — and a partial update would
   * have to guess whether an absent key means "unchanged" or "cleared".
   */
  boardSettings: (id: string, settings: BoardSettings) =>
    put<{ version: number }>("/api/board/" + encodeURIComponent(id), settings),
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
