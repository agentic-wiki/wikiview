import { afterEach, beforeEach, expect, test } from "bun:test";
import { createRoot, type Root } from "react-dom/client";
import { StrictMode, act } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { App } from "@/App";
import { proposeMessage } from "@/shell/GitActions";
import type { BundleInfo, Entry, GitStatus, Graph, TreeNode } from "@/api";
import { forget } from "@/cache";
import { resize } from "./test-setup";

/**
 * These mount the real app and drive it, which is the only way to know it
 * *rehydrates* rather than merely that the server returned some HTML. A cold
 * load of `/wiki/notes/a.md` serves index.html from a path that is not a file;
 * whether the app then boots, reads the route, fetches, and renders the entry is
 * a separate question that a status code cannot answer.
 *
 * Not a browser — no browser is available here — but real execution: the module
 * graph runs, effects fire, and the router resolves against the URL.
 */

const bundle: BundleInfo = {
  id: "abc123",
  label: "My kb",
  dir: "/tmp/my-kb",
  spec: "0.1",
  entries: 3,
  tools: ["wikiview"],
  tags: [],
  version: 1,
  boards: [{ path: "/notes", id: "notes", name: "Notes", status: "status", cards: 3 }],
  // One graph, over the same folder under the same id as the board: the two
  // are addressed under different prefixes and must not be confused.
  graphs: [{ path: "/notes", id: "notes", name: "Who links whom", entries: 3 }],
};

/** The graph over /notes: A and B link each other, A links the front door from
 *  outside the folder, and D links nothing and is linked by nothing — which is
 *  still a node. */
const graphFixture: Graph = {
  path: "/notes",
  id: "notes",
  name: "Who links whom",
  where: ["type=note"],
  neighbours: true,
  // What the folder holds, before the filter: `task` is offerable though no node
  // is one.
  fields: [
    { key: "status", values: ["todo"] },
    { key: "type", values: ["note", "task"] },
  ],
  nodes: [
    { path: "/index.md", label: "Index", neighbour: true },
    { path: "/notes/a.md", label: "A", title: "A Note", type: "note" },
    { path: "/notes/b.md", label: "B", type: "note" },
    { path: "/notes/d.md", label: "D", type: "note" },
  ],
  edges: [
    { from: "/notes/a.md", to: "/notes/b.md", mutual: true, via: ["blockers", "body"], count: 3 },
    { from: "/notes/a.md", to: "/index.md", via: ["body"], count: 1 },
  ],
};

const tree: TreeNode = {
  path: "/",
  name: "",
  index: "/index.md",
  entries: [{ path: "/index.md", name: "index.md", type: "", label: "Index", changedAt: 1, links: 0 }],
  children: [
    {
      path: "/notes",
      name: "notes",
      // Prefixed on disk, readable in the UI, so the two are distinguishable.
      label: "Notes",
      entries: [
        // Its title says something its filename does not, which is what keeps
        // "shows the label" and "shows the title" telling apart.
        { path: "/notes/a.md", name: "a.md", type: "note", label: "A", title: "A Note", changedAt: 1, links: 0 },
        { path: "/notes/b.md", name: "b.md", type: "note", label: "B", changedAt: 1, links: 0 },
        { path: "/notes/checks.md", name: "checks.md", type: "task", label: "Checks", changedAt: 1, links: 0 },
      ],
      children: [],
    },
    // A folder holding nothing, so "only folders with entries are offered as
    // boards" is a case with a fixture rather than a claim.
    { path: "/empty", name: "empty", label: "Empty", entries: [], children: [] },
  ],
};

const entry: Entry = {
  path: "/notes/a.md",
  title: "A Note",
  type: "note",
  frontmatter: { title: "A Note", status: "todo", blockers: ["/notes/b.md"] },
  body:
    "# A Note\n\nThe body of the entry. See [b](./b.md) and [readme](../README.md).\n" +
    "The [contract](./contract.sol) and ![a diagram](./diagram.png).\nAnd [gone](./gone.md).\n" +
    // Inside the bundle and outside /notes, which is the only combination that
    // tells "leaves for the reader" from "opens as a card" on a board over /notes.
    "Back to the [front door](../index.md).\n",
  links: [
    { raw: "./b.md", to: "/notes/b.md", anchor: "", text: "b", line: 3, exists: true, outside: false },
    { raw: "../README.md", to: "", anchor: "", text: "readme", line: 4, exists: false, outside: true },
    // A file the bundle carries rather than an entry, and an image of one.
    {
      raw: "./contract.sol",
      to: "/notes/contract.sol",
      anchor: "",
      text: "contract",
      line: 5,
      exists: false,
      outside: false,
      asset: "/raw/notes/contract.sol",
    },
    {
      raw: "./diagram.png",
      to: "/notes/diagram.png",
      anchor: "",
      text: "diagram",
      line: 6,
      exists: false,
      outside: false,
      asset: "/raw/notes/diagram.png",
    },
    // A `.md` nobody has written: not a file to fetch.
    { raw: "./gone.md", to: "/notes/gone.md", anchor: "", text: "gone", line: 7, exists: false, outside: false },
    {
      raw: "../index.md",
      to: "/index.md",
      anchor: "",
      text: "front door",
      line: 8,
      exists: true,
      outside: false,
    },
  ],
  frontmatterRefs: [{ key: "blockers", value: "/notes/b.md", to: "/notes/b.md", label: "B" }],
  backlinks: [
    { from: "/index.md", title: "The Front Door", text: "a note", line: 3 },
    // A folder's own index linking to a task in it: the shape that showed the
    // board rule was testing the wrong thing, since an index is never a card.
    { from: "/notes/index.md", title: "Notes", text: "the note", line: 2 },
  ],
  headings: [{ level: 1, text: "A Note", id: "a-note", line: 5, bodyLine: 1 }],
  checkboxes: [],
};

/** The front door, with a body of its own. Distinct from every other entry on
 *  purpose: serving one fixture for two paths makes "the right entry rendered"
 *  unobservable, and a test that cannot see it passes for the wrong reason. */
const indexEntry: Entry = {
  path: "/index.md",
  title: "The Front Door",
  type: "",
  frontmatter: { okf_version: "0.1" },
  body: "# The Front Door\n\nWhere the bundle starts.\n",
  links: [],
  frontmatterRefs: [],
  backlinks: [],
  headings: [{ level: 1, text: "The Front Door", id: "the-front-door", line: 4, bodyLine: 1 }],
  checkboxes: [],
};

/** An entry whose checkbox sits on line 6 — deliberately not the line a client
 *  could infer by counting rendered items, so the test proves the server-given
 *  line is what travels. */
const checksEntry: Entry = {
  path: "/notes/checks.md",
  title: "Checks",
  type: "task",
  frontmatter: { status: "todo" },
  body: "Some prose first.\n\nAnd more.\n\n- [ ] the only checkbox\n",
  links: [],
  frontmatterRefs: [],
  backlinks: [],
  headings: [],
  // File line 6, body line 5: the frontmatter offset is exactly what the two
  // coordinate systems exist to keep straight.
  checkboxes: [{ line: 6, bodyLine: 5, done: false, text: "the only checkbox" }],
};

/** Opens with prose that already says its own title, in emphasis. Prepending
 *  here would show the same words twice. */
const namedInProse: Entry = {
  path: "/notes/named.md",
  title: "A markdown reader",
  type: "note",
  frontmatter: { title: "A markdown reader" },
  body: "**A markdown reader** by default, opening on the front door.\n",
  links: [],
  frontmatterRefs: [],
  backlinks: [],
  headings: [],
  checkboxes: [],
};

/** Opens with a heading that says something *other* than the title. Without
 *  this, the two branches of the rule overlap — a heading whose text matches the
 *  title is also caught by the prose check — and dropping the heading branch
 *  would go unnoticed. */
const headingDiffers: Entry = {
  path: "/notes/differs.md",
  title: "Deployment runbook",
  type: "note",
  frontmatter: { title: "Deployment runbook" },
  body: "# Steps\n\nFirst, do the thing.\n",
  links: [],
  frontmatterRefs: [],
  backlinks: [],
  headings: [{ level: 1, text: "Steps", id: "steps", line: 4, bodyLine: 1 }],
  checkboxes: [],
};

/** An entry with a seven-column table: the shape the scroller wrapper is for. */
const tableEntry: Entry = {
  path: "/notes/wide.md",
  title: "Counts",
  type: "dataset",
  frontmatter: { status: "todo" },
  body:
    "# Counts\n\n" +
    "What shipped, counted by quarter.\n\n" +
    "| Area | Q1 | Q2 | Q3 | Q4 | Owner | Notes |\n" +
    "| --- | --- | --- | --- | --- | --- | --- |\n" +
    "| Reader | 12 | 18 | 21 | 30 | ada | up and to the right |\n" +
    "| Boards | 4 | 6 | 9 | 11 | grace | slower than the reader |\n",
  links: [],
  frontmatterRefs: [],
  backlinks: [],
  headings: [{ level: 1, text: "Counts", id: "counts", line: 4, bodyLine: 1 }],
  checkboxes: [],
};

let listeners: Record<string, (e: MessageEvent) => void> = {};

/** Delivers a version on the stream the app is subscribed to. */
function emitVersion(v: number) {
  listeners.version?.(new MessageEvent("version", { data: String(v) }));
}

let fetches = 0;
/** Every draft the declaring form asked for, so a test can see it follow the
 *  folder. Compared as a set: StrictMode runs the effect twice, aborting the first. */
let drafts: string[] = [];
const draftFields = [
  { key: "status", values: ["done", "todo"] },
  { key: "type", values: ["idea", "task"] },
];
/** How many requests the app has made, so a test can assert that a redundant
 *  event caused none. */
function fetchCount() {
  return fetches;
}

/** An entry with sections, for "On this page": two h2s and an h3 between. */
const sectionsEntry: Entry = {
  path: "/notes/sections.md",
  title: "Sections",
  type: "note",
  frontmatter: { tags: ["api", "ui"], owners: ["ana", "jordi"] },
  body: "## First\n\nOne.\n\n### Detail\n\nMore.\n\n## Second\n\nTwo.\n",
  links: [],
  frontmatterRefs: [],
  backlinks: [],
  headings: [
    { level: 2, text: "First", id: "first", line: 5, bodyLine: 1 },
    { level: 3, text: "Detail", id: "detail", line: 9, bodyLine: 5 },
    { level: 2, text: "Second", id: "second", line: 13, bodyLine: 9 },
  ],
  checkboxes: [],
  updated: new Date(Date.now() - 3 * 3600_000).toISOString(),
};

function stubFetch() {
  fetches = 0;
  drafts = [];
  const body = (v: unknown) =>
    Promise.resolve(new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } }));
  globalThis.fetch = ((input: RequestInfo | URL) => {
    fetches++;
    const url = String(input);
    if (url.endsWith("/api/bundle")) return body(bundle);
    if (url.endsWith("/api/tree")) return body(tree);
    // What a view over a folder starts as: the server's default filter, which
    // only a board has, and the folder's keys to choose another from.
    if (url.includes("/api/draft/")) {
      drafts.push(url.slice(url.indexOf("/api/draft/")));
      return body({ where: url.includes("/board/") ? ["type=task"] : [], fields: draftFields });
    }
    if (url.includes("/api/board/")) return body(boardFixture);
    if (url.endsWith("/api/graph/notes")) return body(graphFixture);
    if (url.includes("/api/entry/notes/checks.md")) return body(checksEntry);
    if (url.includes("/api/entry/notes/named.md")) return body(namedInProse);
    if (url.includes("/api/entry/notes/differs.md")) return body(headingDiffers);
    if (url.includes("/api/entry/notes/wide.md")) return body(tableEntry);
    if (url.includes("/api/entry/notes/sections.md")) return body(sectionsEntry);
    // Only the entries the fixture actually declares. A catch-all here would
    // mean a "missing" entry still returned content, and the not-found path
    // would never be exercised.
    if (url.includes("/api/entry/index.md")) return body(indexEntry);
    if (url.includes("/api/entry/notes/a.md")) return body(entry);
    return Promise.resolve(
      new Response(JSON.stringify({ error: "no entry at that path" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  // A stream a test can drive, via emitVersion. Installed here rather than per
  // test because mountAt owns the stubbing, and a test installing its own would
  // be replaced by this one.
  listeners = {};
  globalThis.EventSource = class {
    addEventListener(type: string, fn: (e: MessageEvent) => void) {
      listeners[type] = fn;
    }
    removeEventListener(type: string) {
      delete listeners[type];
    }
    close() {}
  } as unknown as typeof EventSource;
}

let root: Root | undefined;
let container: HTMLElement | undefined;

// The reader remembers view preferences per bundle, so without this each test
// would start inside the last one's browser and the tree would open where a
// previous test left it.
beforeEach(() => {
  localStorage.clear();
  // Entries read in one test are not entries this one has read, and a copy left
  // behind would answer a fetch that should have been made.
  forget();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

let navigateTo: (to: string) => void = () => {
  throw new Error("not mounted");
};

/** Captures the router's navigate, so a test can move between entries the way a
 *  click does rather than by remounting — which would hide the in-between. */
function NavCapture() {
  navigateTo = useNavigate();
  here = useLocation().pathname;
  return null;
}

/** Where the router currently is. The window's own location does not move under
 *  a MemoryRouter, so asking it would be asking the wrong thing. */
let here = "";

async function mountAt(path: string): Promise<string> {
  // Tear down any previous mount first. Without this a test that mounts twice
  // leaves two trees in the document, and a document-wide query silently reads
  // the older one — which is a test that passes for the wrong reason.
  if (root) {
    await act(async () => root!.unmount());
    container?.remove();
  }
  stubFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      <StrictMode>
        <MemoryRouter initialEntries={[path]}>
          <NavCapture />
          <App />
        </MemoryRouter>
      </StrictMode>,
    );
  });
  // Let the two load effects settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return container.textContent ?? "";
}

test("a deep entry URL renders that entry, not a blank shell", async () => {
  const text = await mountAt("/wiki/notes/a.md");

  // The shell came up, naming the bundle the way it names everything else.
  expect(text).toContain("My kb");
  // …and so did the entry the URL names. This is the assertion a status code
  // cannot make.
  expect(text).toContain("A Note");
  expect(text).toContain("The body of the entry.");
});

test("the tree renders the bundle's folders and entries", async () => {
  const text = await mountAt("/wiki/index.md");
  expect(text).toContain("Notes"); // the folder, named the way its entries are
  expect(text).toContain("Index");
});

test("a folder with an index redirects to it rather than listing", async () => {
  // The root has an index.md, so navigating to the folder must land on the entry
  // — one entry, one URL.
  const text = await mountAt("/wiki/");
  expect(text).toContain("Where the bundle starts.");
});

test("a folder without an index lists its entries", async () => {
  // /notes has no index.md in the fixture, so the reader synthesizes a listing
  // rather than writing one into the bundle.
  const text = await mountAt("/wiki/notes/");
  expect(text).toContain("3 entries");
  expect(text).toContain("A Note");
});

test("markdown renders, and links resolve through the server's table", async () => {
  const text = await mountAt("/wiki/notes/a.md");
  // The body rendered as markdown, not as source.
  expect(text).toContain("The body of the entry.");
  expect(text).not.toContain("# A Note\n");

  const anchors = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
  // `./b.md` is resolved by looking it up, never by path arithmetic here.
  expect(anchors).toContain("/wiki/notes/b.md");
});

test("heading ids come from the server, not from a client slugger", async () => {
  await mountAt("/wiki/notes/a.md");
  const h1 = document.querySelector("h1[id]");
  // The fixture's server-supplied id. A client slugger would have produced this
  // one too — the point is that it is not asked to.
  expect(h1?.getAttribute("id")).toBe("a-note");
});

test("a checkbox toggle sends the line the server gave, with the version", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const realFetch = globalThis.fetch;
  await mountAt("/wiki/notes/checks.md");
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT") {
      calls.push({ url: String(input), body: JSON.parse(String(init.body)) });
      return Promise.resolve(new Response(JSON.stringify({ version: 2 }), {
        headers: { "content-type": "application/json" },
      }));
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
  expect(box).not.toBeNull();
  await act(async () => {
    box!.click();
  });

  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toContain("/api/checkbox/notes/checks.md");
  // Line 6 is what the fixture's server said, not a count of rendered items.
  expect(calls[0]!.body).toEqual({ line: 6, done: true, version: 1 });
  // The line sent is the *file* line, not the body line it was matched by.
  expect((calls[0]!.body as { line: number }).line).not.toBe(checksEntry.checkboxes[0]!.bodyLine);
});

// A large bundle should open navigable, not as a wall — but arriving at a deep
// entry must show where you are.
test("the tree collapses folders except along the path to the current entry", async () => {
  await mountAt("/wiki/index.md");
  const atRoot = [...document.querySelectorAll("nav a, aside a")].map((a) => a.textContent);
  expect(atRoot).not.toContain("A"); // /notes is collapsed

  await mountAt("/wiki/notes/a.md");
  const deep = [...document.querySelectorAll("aside a")].map((a) => a.textContent);
  expect(deep).toContain("A"); // its folder was opened for it
});

// Expanding a folder is a view preference, and losing it on every reload makes
// the tree something you re-navigate rather than something you keep open.
test("the tree opens where this bundle was left, and ignores another bundle's", async () => {
  localStorage.setItem(`wiki:${bundle.id}:tree:expanded`, JSON.stringify(["/notes"]));
  await mountAt("/wiki/index.md");
  const restored = [...document.querySelectorAll("aside a")].map((a) => a.textContent);
  expect(restored).toContain("A"); // /notes was left open, though nothing here is under it

  // The same preference filed under a different bundle does not apply here.
  localStorage.clear();
  localStorage.setItem(`wiki:other-bundle:tree:expanded`, JSON.stringify(["/notes"]));
  await mountAt("/wiki/index.md");
  const isolated = [...document.querySelectorAll("aside a")].map((a) => a.textContent);
  expect(isolated).not.toContain("A");
});

/** Serves a tree in which one entry has moved to a later version. */
function withChange(path: string, at: number): TreeNode {
  const bump = (n: TreeNode): TreeNode => ({
    ...n,
    entries: n.entries.map((e) => (e.path === path ? { ...e, changedAt: at } : e)),
    children: n.children.map(bump),
  });
  return bump(tree);
}

/** The marks currently rendered in the panel, by the row they sit on. */
function marked(): string[] {
  return [...document.querySelectorAll("aside a, aside button")]
    .filter((row) => row.querySelector('[aria-label="changed"]'))
    .map((row) => row.textContent ?? "");
}

// An agent edits the bundle while it is open. The screen follows along and the
// tree says nothing, so a change you were not looking at is one you never learn
// about.
test("an entry that changed since you saw it is marked, and opening it clears the mark", async () => {
  // Arriving for the first time: everything counts as seen, or the whole tree
  // would be marked on first open and the mark would mean nothing.
  await mountAt("/wiki/notes/a.md");
  expect(marked()).toEqual([]);

  // /notes/b.md changes on disk while /notes/a.md is open.
  const changed = withChange("/notes/b.md", 2);
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/api/tree")) {
      return Promise.resolve(
        new Response(JSON.stringify(changed), { headers: { "content-type": "application/json" } }),
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;

  // The greeting first, which is what the server sends on connect, then the
  // version that actually reports the change.
  await act(async () => emitVersion(1));
  await act(async () => emitVersion(2));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(marked()).toContain("B");
  expect(marked()).not.toContain("A"); // the one you are looking at is not news

  // Opening it is what clears it. Not looking at it: a mark that clears without
  // you doing anything is worse than one that stays.
  await act(async () => navigateTo("/wiki/notes/b.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(marked()).toEqual([]);

  globalThis.fetch = realFetch;
});

// Ticking a checkbox changes the file, which moves that entry's version like
// any other change. Marking it would be telling you about your own edit, in the
// entry you are looking at.
test("a change you made yourself does not mark the entry you made it in", async () => {
  await mountAt("/wiki/notes/checks.md");

  const realFetch = globalThis.fetch;
  const bumped = withChange("/notes/checks.md", 2);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return Promise.resolve(
        new Response(JSON.stringify({ version: 2 }), { headers: { "content-type": "application/json" } }),
      );
    }
    if (String(input).endsWith("/api/tree")) {
      return Promise.resolve(
        new Response(JSON.stringify(bumped), { headers: { "content-type": "application/json" } }),
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
  await act(async () => box!.click());

  // The write bumps the version, and the server tells every client — including
  // the one that asked for it.
  await act(async () => emitVersion(1));
  await act(async () => emitVersion(2));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(marked()).toEqual([]);
  globalThis.fetch = realFetch;
});

// Same rule, for a change you did not make: the entry on screen updates in front
// of you, so marking it is telling you about something you just watched happen.
// Derived from the current route rather than cleared afterwards, or the mark
// would appear for a frame on the one entry certain to be under your eyes.
test("the entry you are reading is not marked when it changes underneath you", async () => {
  await mountAt("/wiki/notes/a.md");

  const realFetch = globalThis.fetch;
  const bumped = withChange("/notes/a.md", 2);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/api/tree")) {
      return Promise.resolve(
        new Response(JSON.stringify(bumped), { headers: { "content-type": "application/json" } }),
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;

  await act(async () => emitVersion(1));
  await act(async () => emitVersion(2));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(marked()).toEqual([]);

  // …and it stays cleared once you leave, rather than reappearing as unseen.
  await act(async () => navigateTo("/wiki/notes/b.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(marked()).toEqual([]);

  globalThis.fetch = realFetch;
});

// An entry created while you were away is absent from the record entirely, not
// merely older than it. Treating "never seen" as "seen" would make every new
// entry arrive silently, which is the case this whole mark exists for.
test("an entry that did not exist when you were last here is marked", async () => {
  localStorage.setItem(
    `wiki:${bundle.id}:seen`,
    JSON.stringify({ "/index.md": 1, "/notes/a.md": 1 }), // b.md is new
  );
  await mountAt("/wiki/notes/a.md");
  expect(marked()).toContain("B");
});

// The mark is one person's attention in one browser, so it must not appear in
// another bundle where the paths may not even exist.
test("marks do not carry into another bundle", async () => {
  localStorage.setItem(
    `wiki:${bundle.id}:seen`,
    JSON.stringify({ "/index.md": 1, "/notes/a.md": 1, "/notes/b.md": 0 }),
  );
  await mountAt("/wiki/index.md");
  expect(marked().join()).toContain("Notes"); // the folder above the changed entry

  localStorage.clear();
  localStorage.setItem(
    `wiki:another-bundle:seen`,
    JSON.stringify({ "/index.md": 1, "/notes/a.md": 1, "/notes/b.md": 0 }),
  );
  await mountAt("/wiki/index.md");
  expect(marked()).toEqual([]);
});

// You navigated to a file, so navigation says which file. An entry's own title
// belongs to the entry, and a tree that swapped one for the other would rename
// rows out from under the paths you are following.
test("navigation names the file; the entry names itself", async () => {
  await mountAt("/wiki/notes/a.md");

  const inTree = [...document.querySelectorAll("aside a")].map((a) => a.textContent);
  expect(inTree).toContain("A"); // the filename, made readable
  expect(inTree).not.toContain("A Note"); // not what the entry calls itself

  const crumbs = document.querySelector('nav[aria-label="Breadcrumb"]')!;
  expect(crumbs.textContent).toContain("A");
  expect(crumbs.textContent).not.toContain("A Note");
  // Not the raw filename either, which is what a failed lookup falls back to.
  expect(crumbs.textContent).not.toContain("a.md");
  // Folders are walked the same way, so the trail does not read half-slugged.
  expect(crumbs.textContent).toContain("Notes");
  expect(crumbs.textContent).not.toContain("notes");

  // …while the entry itself still says what it is.
  expect(document.querySelector("article")?.textContent).toContain("A Note");
});

// The tab, the bookmark, the history entry and the printed page header are all
// this one string, and it moves without a page load, so nothing else keeps it
// honest.
test("the document title says what is on screen, and follows navigation", async () => {
  await mountAt("/wiki/notes/a.md");
  // What the entry calls itself, not the filename the tree shows: this names a
  // page rather than a place.
  expect(document.title).toBe("A Note · My kb");

  // An entry carrying no title falls back to the readable filename.
  await act(async () => navigateTo("/wiki/notes/b.md"));
  expect(document.title).toBe("B · My kb");

  // A folder listing names the folder.
  await act(async () => navigateTo("/wiki/notes/"));
  expect(document.title).toBe("Notes · My kb");

  // A page of the app, not of the bundle, and still named.
  await act(async () => navigateTo("/changed"));
  expect(document.title).toBe("Recently changed · My kb");

  const restore = stubBoard();
  await act(async () => navigateTo("/kanban/notes"));
  expect(document.title).toBe("Notes · My kb");
  // A card is what you are reading; the board behind it is context.
  await act(async () => navigateTo("/kanban/notes/notes/a.md"));
  expect(document.title).toBe("A Note · My kb");
  restore();
});

test("a route naming no one thing is titled with the bundle alone", async () => {
  // The bundle's front door is the bundle: naming it would give "My kb (index) ·
  // My kb", which is the same words twice and a parenthesis.
  await mountAt("/wiki/");
  expect(document.title).toBe("My kb");

  // A path the tree does not list, and a board id that no longer exists: both
  // have nothing to name, and neither leaves the previous entry's title up.
  await act(async () => navigateTo("/wiki/notes/gone.md"));
  expect(document.title).toBe("My kb");
  await act(async () => navigateTo("/kanban/deleted"));
  expect(document.title).toBe("My kb");
});

/** The logo: the bundle's tile and name, one link to the front door. */
const logo = () => document.querySelector<HTMLAnchorElement>("header a[title=\"Go to the bundle's front door\"]");
const crumbTexts = () =>
  [...document.querySelectorAll('nav[aria-label="Breadcrumb"] > span > :last-child')].map((c) => c.textContent);

// The bundle is named once, by the logo; the fallbacks when it has no index.md
// are pinned beside `frontDoor` in tree.test.ts.
test("the logo names the bundle and links to its front door", async () => {
  await mountAt("/wiki/notes/a.md");
  expect(logo()?.getAttribute("href")).toBe("/wiki/index.md");
  expect(logo()?.textContent).toBe("MMy kb"); // the tile's initial, then the name
  // Not also the first crumb: the trail starts inside the bundle.
  expect(crumbTexts()).toEqual(["Notes", "A"]);
});

// A board and a graph are addressed by an id, which is not a path to walk, so
// their trail is the section and the view's name — where it used to be empty.
test("the trail names the board, the graph, or the list you are on", async () => {
  const restore = stubBoard();
  await mountAt("/kanban/notes");
  expect(crumbTexts()).toEqual(["Boards", "Notes"]);
  restore();

  await act(async () => navigateTo("/changed"));
  expect(crumbTexts()).toEqual(["Recently changed"]);
  await act(async () => navigateTo("/read-later"));
  expect(crumbTexts()).toEqual(["Read later"]);
  await act(async () => navigateTo("/graph/notes"));
  expect(crumbTexts()).toEqual(["Graphs", "Who links whom"]);
  // An id nothing declares still says what it is, rather than nothing.
  await act(async () => navigateTo("/graph/gone"));
  expect(crumbTexts()).toEqual(["Graphs", "gone"]);
});

// The section crumb has nowhere to go — a board is not inside "Boards" the way
// an entry is inside a folder — so it opens the list of the others instead.
test("the Boards crumb opens the boards panel", async () => {
  const restore = stubBoard();
  await mountAt("/kanban/notes");
  const panel = document.querySelector("aside")!;
  expect(panel.getAttribute("data-open")).toBe("false"); // one board, so no list by default
  const boards = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Breadcrumb"] button')].find(
    (b) => b.textContent === "Boards",
  )!;
  await act(async () => boards.click());
  expect(panel.getAttribute("data-open")).toBe("true");
  expect(panel.textContent).toContain("Notes");
  restore();
});

// The last crumb is where you are, and a link to where you are is a link that
// does nothing.
test("the last crumb is not a link", async () => {
  await mountAt("/wiki/notes/a.md");
  const nav = document.querySelector('nav[aria-label="Breadcrumb"]')!;
  expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Notes"]);
});

// A re-read that is still going looks like one: the glyph turns and the button
// takes no second click, until the answer lands.
test("refresh spins and holds while the re-read is in flight", async () => {
  await mountAt("/wiki/index.md");
  const real = globalThis.fetch;
  let finish: () => void = () => {};
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    String(input) === "/api/refresh"
      ? new Promise<Response>((resolve) => {
          finish = () => resolve(new Response(JSON.stringify({ version: 2 }), { headers: { "content-type": "application/json" } }));
        })
      : real(input, init)) as typeof fetch;

  const button = document.querySelector<HTMLButtonElement>("[aria-label='Refresh the index']")!;
  await act(async () => button.click());
  expect(button.disabled).toBe(true);
  expect(button.querySelector("svg")?.getAttribute("class")).toContain("animate-wv-spin");

  await act(async () => finish());
  expect(button.disabled).toBe(false);
  expect(button.querySelector("svg")?.getAttribute("class")).not.toContain("animate-wv-spin");
  globalThis.fetch = real;
});

// React reuses DOM nodes between routes, so a selection made on one entry
// reappears over whatever text lands in those nodes next — highlighted words
// nobody selected. A full page load would never do this.
test("a text selection does not survive navigation", async () => {
  await mountAt("/wiki/notes/a.md");

  const target = document.querySelector("p");
  expect(target).not.toBeNull();
  const range = document.createRange();
  range.selectNodeContents(target!);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  expect(selection.isCollapsed).toBe(false);

  await mountAt("/wiki/index.md");
  expect(window.getSelection()?.isCollapsed ?? true).toBe(true);
});

// A link is usually labelled with its target's name, so showing the link text
// as the backlink's heading reads as this page's own title. What identifies the
// source is the source's title.
test("a backlink names the entry that links here, not the words it used", async () => {
  await mountAt("/wiki/notes/a.md");
  const column = document.querySelector("article section > div:last-child")!;
  expect(column.textContent).toContain("Linked from · 2");
  const row = column.querySelector("a")!;
  expect(row.textContent).toContain("The Front Door"); // the linking entry's own title
  expect(row.getAttribute("title")).toBe("/index.md:3"); // and where in it
});

// A URL outside the app's routes used to render an empty page, which reads as a
// broken app rather than a wrong address.
test("an unknown URL says so instead of rendering nothing", async () => {
  const text = await mountAt("/README.md");
  expect(text).toContain("Nothing at this address");
  expect(text).toContain("/README.md");
});

// A missing entry is ordinary in this format — a link may point at knowledge not
// yet written — so it gets a placeholder rather than an error.
test("an entry that does not exist gets a placeholder", async () => {
  const text = await mountAt("/wiki/notes/never-written.md");
  expect(text).toContain("no entry here yet");
});

// Any frontmatter value that names an entry becomes a link, whatever the field
// is called, and it shows the target's title rather than its path.
test("frontmatter values that resolve are links; others are text", async () => {
  openProperties();
  await mountAt("/wiki/notes/a.md");
  const strip = document.querySelector("dl")!;
  const link = strip.querySelector("a");
  expect(link?.getAttribute("href")).toBe("/wiki/notes/b.md");
  // Named the way the tree names it: a reference points at a file, and an entry
  // answering to two names depending on where you met it is what makes a bundle
  // hard to hold in your head.
  expect(link?.textContent).toBe("B");
  // A value with no counterpart in the table stays plain text.
  expect(strip.textContent).toContain("todo");
  expect(strip.querySelectorAll("a")).toHaveLength(1);
});

// A bundle carries files it does not index: an image, a contract, a spreadsheet
// beside the notes about it. The reader could not tell one of those from an
// entry nobody has written, and sent both to a page that does not exist.
test("a file the bundle carries is fetched, not navigated to", async () => {
  await mountAt("/wiki/notes/a.md");
  const anchors = [...document.querySelectorAll(".markdown a")];

  const asset = anchors.find((a) => a.textContent === "contract");
  expect(asset?.getAttribute("href")).toBe("/raw/notes/contract.sol");
  // A new tab, so looking at a PDF does not cost you the entry you were reading.
  expect(asset?.getAttribute("target")).toBe("_blank");
  expect(asset?.getAttribute("rel")).toContain("noopener");

  // An entry nobody has written is still a route, not a download: per the format
  // a link may point at knowledge that does not exist yet.
  const unwritten = anchors.find((a) => a.textContent === "gone");
  expect(unwritten?.getAttribute("href")).toBe("/wiki/notes/gone.md");
});

// An image needs no mechanism of its own. Given the address, the browser fetches
// it over HTTP like any other image.
test("an image in an entry loads from where the server says it is", async () => {
  await mountAt("/wiki/notes/a.md");
  const img = document.querySelector(".markdown img");
  expect(img?.getAttribute("src")).toBe("/raw/notes/diagram.png");
  expect(img?.getAttribute("alt")).toBe("a diagram");
});

// A relative href pointing above the bundle resolves against the *current
// route* in the browser, so rendering it as an anchor turns a click into a full
// page load into an address the app does not serve.
test("a link out of the bundle is not an anchor", async () => {
  await mountAt("/wiki/notes/a.md");
  const anchors = [...document.querySelectorAll(".markdown a")];
  const hrefs = anchors.map((a) => a.getAttribute("href"));
  expect(hrefs).toContain("/wiki/notes/b.md"); // the in-bundle one still navigates

  // The property that matters is that it is not an anchor at all. Asserting the
  // href is absent is weaker: without the branch it becomes href="/wiki" — a
  // different broken link, which such an assertion would happily accept.
  expect(anchors.map((a) => a.textContent)).not.toContain("readme");
  // …but its text survives, marked.
  expect(document.querySelector(".markdown")?.textContent).toContain("readme");
});

// Most entries open with "# Something", so prepending a title unconditionally
// would show it twice. Never prepending leaves an entry that opens with prose
// with no visible name at all.
test("a title is prepended only when the body does not already name itself", async () => {
  // The fixture's body starts with "# A Note".
  await mountAt("/wiki/notes/a.md");
  const article = document.querySelector("article")!;
  expect(article.querySelectorAll("h1")).toHaveLength(1);

  // checks.md opens with prose that says nothing about its name, so it gets one.
  await mountAt("/wiki/notes/checks.md");
  expect(document.querySelector("article")!.querySelector("h1")?.textContent).toBe("Checks");

  // …but prose that already says the title is left alone, or the same words
  // appear twice in a row.
  await mountAt("/wiki/notes/named.md");
  expect(document.querySelector("article")!.querySelector("h1")).toBeNull();

  // A body that opens with a heading is left alone even when that heading says
  // something different from the title — an entry gets one heading, and it is
  // the one its author wrote.
  await mountAt("/wiki/notes/differs.md");
  const headings = [...document.querySelectorAll("article h1")].map((h) => h.textContent);
  expect(headings).toHaveLength(1);
  expect(headings[0]).toContain("Steps");
  expect(headings[0]).not.toContain("Deployment runbook");
});

// The title comes first whichever source it has — borrowed from the entry, or
// lifted from the body's own opening heading — so every entry is laid out the
// same way: toolbar, title, what it is, then the properties and the body.
test("the title sits above the properties, whether borrowed or the body's own", async () => {
  openProperties();
  for (const path of ["/wiki/notes/checks.md", "/wiki/notes/a.md"]) {
    await mountAt(path);
    const kids = [...document.querySelector("article")!.children];
    const h1 = kids.findIndex((n) => n.tagName === "H1");
    const grid = kids.findIndex((n) => n.tagName === "DL" || n.querySelector("dl") !== null);
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThan(grid);
    // One title, never two: a lifted heading leaves the body.
    expect(document.querySelectorAll("article h1")).toHaveLength(1);
  }
  // a.md opens with "# A Note": that heading is the title, and keeps its anchor.
  expect(document.querySelector("article h1")?.textContent).toBe("A Note");
  expect(document.querySelector(".markdown h1")).toBeNull();
});

// The outgoing entry stays rendered until the incoming one arrives. Blanking
// instead collapses the view to nothing, and a container with no height cannot
// hold a scroll position: the browser clamps it to zero, so going back loses
// where you were before the content that could hold it exists.
test("navigating keeps the previous entry rendered until the new one arrives", async () => {
  await mountAt("/wiki/notes/a.md");
  expect(document.body.textContent).toContain("The body of the entry.");

  // A fetch that never settles, so the in-between state is observable.
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/api/entry/")) return new Promise(() => {});
    return realFetch(input, init);
  }) as typeof fetch;

  await act(async () => {
    navigateTo("/wiki/notes/checks.md");
  });

  // Still on screen, so the layout keeps its height across the navigation.
  expect(document.body.textContent).toContain("The body of the entry.");
  globalThis.fetch = realFetch;
});

// A checkbox is addressed by a line number, which means nothing across two
// files. While a navigation is in flight the entry on screen is not the one the
// URL names, so a click must not be sent against the new path.
test("a checkbox on a superseded entry does not write to the entry being loaded", async () => {
  await mountAt("/wiki/notes/checks.md");
  const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
  expect(box).not.toBeNull();

  const realFetch = globalThis.fetch;
  const writes: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT") writes.push(String(input));
    if (String(input).includes("/api/entry/")) return new Promise(() => {});
    return realFetch(input, init);
  }) as typeof fetch;

  await act(async () => {
    navigateTo("/wiki/notes/a.md");
  });
  await act(async () => {
    box!.click();
  });

  expect(writes).toEqual([]);
  globalThis.fetch = realFetch;
});

// The stream greets every connection with the current version, and EventSource
// reconnects on its own. Acting on a version already held means the page renders
// and then replaces itself a moment later for no reason.
test("a version the client already has does not trigger a refetch", async () => {
  await mountAt("/wiki/notes/a.md");
  const before = fetchCount();

  // The greeting, then a reconnect repeating it.
  await act(async () => emitVersion(1));
  await act(async () => emitVersion(1));
  expect(fetchCount()).toBe(before);

  // A version that is genuinely new does refetch.
  await act(async () => emitVersion(2));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(fetchCount()).toBeGreaterThan(before);
});

const boardFixture = {
  path: "/notes",
  id: "notes",
  name: "Notes",
  field: "status",
  lane: "priority",
  where: ["type=task", "priority!=low"],
  blockers: "blockers",
  // The order the bands go in, which the server settles: `priority` is a
  // vocabulary it knows, so high before low without anybody configuring it.
  lanes: ["high", "low", ""],
  declared: true,
  // What the folder holds, taken before the board's own filter — which is why
  // `type=note` is offerable even though no card is one. `title` has too many
  // values to be a choice, so it carries none.
  fields: [
    { key: "priority", values: ["high", "low"] },
    { key: "status", values: ["blocked", "todo"] },
    // A list: it filters on membership and groups not at all.
    { key: "tags", values: ["api", "ui"], list: true },
    { key: "title" },
    { key: "type", values: ["note", "task"] },
  ],
  columns: [
    {
      value: "todo",
      pinned: true,
      cards: [
        {
          path: "/notes/a.md",
          label: "A",
          title: "A Note",
          type: "task",
          lane: "high",
          blockedBy: 2,
          blocks: 1,
          tags: ["ui", "api", "reader", "boards"],
        },
        { path: "/notes/checks.md", label: "Checks", type: "task" },
      ],
    },
    // Declared and empty: the thing inference cannot do.
    { value: "in-progress", pinned: true, cards: [] },
    // Nobody declared this one; it exists because an entry has it.
    {
      value: "blocked",
      pinned: false,
      cards: [{ path: "/notes/b.md", label: "B", type: "task", lane: "low" }],
    },
    // Entries carrying no status at all, which the server appends last.
    { value: "", pinned: false, cards: [{ path: "/notes/d.md", label: "D", type: "task" }] },
  ],
};

/** Serves the board fixture alongside everything else. */
function stubBoard() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/api/board/")) {
      return Promise.resolve(
        new Response(JSON.stringify(boardFixture), {
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}

// A board id in the URL is enough to render the whole board.
test("a kanban URL renders columns of cards", async () => {
  await mountAt("/wiki/index.md");
  const restore = stubBoard();
  await act(async () => navigateTo("/kanban/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const columns = [...document.querySelectorAll("main section[aria-label] h2")].map((h) => h.textContent);
  // De-sluggified for reading; the value itself is untouched, which is what the
  // section is still labelled with.
  expect(columns).toEqual(["todo", "in progress", "blocked", "no status"]);

  // A declared column with nothing in it still appears, and says so rather than
  // looking broken.
  const empty = [...document.querySelectorAll("main section[aria-label]")].find(
    (s) => s.getAttribute("aria-label") === "in-progress",
  )!;
  expect(empty.textContent).toContain("Empty");

  restore();
});

// A card opens beside the board rather than instead of it, and the open card is
// in the URL so back closes it and a link to it reopens the same thing.
test("a card opens over the board, and the board stays", async () => {
  await mountAt("/wiki/index.md");
  const restore = stubBoard();
  await act(async () => navigateTo("/kanban/notes/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // The entry is on screen…
  expect(document.querySelector("[role=\"dialog\"]")?.textContent).toContain("The body of the entry.");
  // …and so are the columns behind it, which is the point of a sheet.
  const columns = [...document.querySelectorAll("main section[aria-label] h2")].map((h) => h.textContent);
  // De-sluggified for reading; the value itself is untouched, which is what the
  // section is still labelled with.
  expect(columns).toEqual(["todo", "in progress", "blocked", "no status"]);

  restore();
});

// A card obeyed the board in its prose and left for the reader from a `blockers`
// chip: one view with three link surfaces, one of which asked. The rule belongs to
// the view, not to the markdown renderer.
test("every link in a card obeys the board, not just the ones in the body", async () => {
  await mountAt("/wiki/index.md");
  const restore = stubBoard();
  await act(async () => navigateTo("/kanban/notes/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await keepSheetProperties();
  const sheet = () => document.querySelector("[role='dialog']")!;

  // `blockers: /notes/b.md` names a card on this board, so it opens that card.
  const chip = [...sheet().querySelectorAll("dl a")].find((a) => a.textContent === "B");
  expect(chip?.getAttribute("href")).toBe("/kanban/notes/notes/b.md");

  // A backlink from the folder's own index.md, which is never a card because it
  // is not a task. It is still this board's folder, so it opens over the board.
  const inFolder = [...sheet().querySelectorAll("section > div:last-child a")].find((a) =>
    (a.textContent ?? "").includes("Notes"),
  );
  expect(inFolder?.getAttribute("href")).toBe("/kanban/notes/notes/index.md");

  // And one from /index.md, outside the folder, so it leaves — the same rule
  // reaching the opposite answer.
  const elsewhere = [...sheet().querySelectorAll("section > div:last-child a")].find((a) =>
    (a.textContent ?? "").includes("The Front Door"),
  );
  expect(elsewhere?.getAttribute("href")).toBe("/wiki/index.md");

  restore();
});

// Staying on the board is the board's rule. The reader has no board to stay on,
// so every link there goes to the reader, including the two that now ask.
test("in the reader, blockers and backlinks stay in the reader", async () => {
  openProperties();
  await mountAt("/wiki/notes/a.md");

  const chip = [...document.querySelectorAll("article dl a")].find((a) => a.textContent === "B");
  expect(chip?.getAttribute("href")).toBe("/wiki/notes/b.md");

  const backlink = [...document.querySelectorAll("article section > div:last-child a")].find((a) =>
    (a.textContent ?? "").includes("The Front Door"),
  );
  expect(backlink?.getAttribute("href")).toBe("/wiki/index.md");
});

// The rule that makes a link off the board ordinary rather than something needing
// special treatment: inside the folder this board covers it opens a card,
// otherwise it leaves.
test("a link inside a card stays on the board when its target is in the board's folder", async () => {
  await mountAt("/wiki/index.md");
  const restore = stubBoard();
  await act(async () => navigateTo("/kanban/notes/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const links = [...document.querySelectorAll("[role=\"dialog\"] .markdown a")];
  // /notes/b.md is a card on this board, so following it swaps the sheet.
  const card = links.find((a) => a.textContent === "b");
  expect(card?.getAttribute("href")).toBe("/kanban/notes/notes/b.md");

  // /notes/gone.md is in the folder and is not a card — it is not even written
  // yet. Still the board's business, so it opens over the board and says there is
  // no entry there, rather than throwing the board away to say it.
  const unwritten = links.find((a) => a.textContent === "gone");
  expect(unwritten?.getAttribute("href")).toBe("/kanban/notes/notes/gone.md");

  // /index.md is outside the folder, so it leaves for the reader.
  const elsewhere = links.find((a) => a.textContent === "front door");
  expect(elsewhere?.getAttribute("href")).toBe("/wiki/index.md");

  restore();
});

// One lane is no lanes. With a lane declared every card carries one, and a card
// missing the field gets its own group rather than joining another's.
test("lanes group a column only when the board declares one", async () => {
  await mountAt("/wiki/index.md");
  const restore = stubBoard();
  await act(async () => navigateTo("/kanban/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // At rest a column shows only the bands it has cards in: an empty one is there
  // to be dropped into, and a board of five lanes by five columns would
  // otherwise be mostly headings for rows that hold nothing.
  const lanes = (column: string) =>
    [...columnEl(column).querySelectorAll("h3")].map((h) => h.textContent);
  expect(lanes("todo")).toEqual(["high", "none"]);
  expect(lanes("blocked")).toEqual(["low"]);
  // The unnamed band is last, being a fact about the cards rather than a lane
  // anybody chose.
  restore();
});

// A lane is a row, so every column has every one of them — but only while a card
// is in the air, which is when an empty band means something.
test("empty lanes appear while a card is being dragged", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const lanes = () => [...columnEl("in-progress").querySelectorAll("h3")].map((h) => h.textContent);
  expect(lanes()).toEqual([]); // nothing in it, so nothing to show

  const card = cardIn("todo", "A")!;
  const press = (type: string, x: number, y: number) =>
    (type === "pointerdown" ? card : (window as unknown as EventTarget)).dispatchEvent(
      new PointerEvent(type, { bubbles: true, button: 0, pointerType: "mouse", clientX: x, clientY: y }),
    );
  await act(async () => void press("pointerdown", 10, 10));
  await act(async () => void press("pointermove", 300, 40));

  // Mid-drag: every lane the board has, so there is somewhere to aim.
  expect(lanes()).toEqual(["high", "low", "none"]);

  await act(async () => void press("pointerup", 300, 40));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(lanes()).toEqual([]);
});

function columnEl(value: string): HTMLElement {
  return [...document.querySelectorAll("main section[aria-label]")].find(
    (s) => s.getAttribute("aria-label") === value,
  )! as HTMLElement;
}

/** A card by a name on its face — its title, or the filename under it — so an
 *  assertion names what a person sees. */
function cardIn(column: string, label: string): HTMLElement | undefined {
  return [...columnEl(column).querySelectorAll("a")].find((a) =>
    [...a.querySelectorAll(":scope > span")].slice(0, 2).some((s) => s.textContent === label),
  );
}

/**
 * Drags one element onto another.
 *
 * happy-dom renders nothing, so hit testing is the one thing supplied here;
 * every other part of the gesture is the real one, dispatched as the browser
 * would in three separate turns.
 */
async function dragTo(card: Element, onto: Element | null | (() => Element | null)) {
  const real = document.elementFromPoint;
  // happy-dom renders nothing, so hit testing is the one thing supplied here.
  // Resolved on each call rather than once, because a drop target can appear
  // *because* a drag started: empty lane bands do exactly that.
  document.elementFromPoint = () => (typeof onto === "function" ? onto() : onto);
  // The press is the element's own handler; everything after it belongs to the
  // document, which is what lets a drag outlive the thing that started it.
  const press = (x: number, y: number) =>
    card.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse", clientX: x, clientY: y }),
    );
  const then = (type: string, x: number, y: number) =>
    window.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse", clientX: x, clientY: y }));
  try {
    await act(async () => void press(10, 10));
    await act(async () => void then("pointermove", 300, 40));
    await act(async () => void then("pointerup", 300, 40));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
  } finally {
    document.elementFromPoint = real;
  }
}

/** Records the writes the app makes, answering each with `status`. */
function captureWrites(status = 200) {
  const real = globalThis.fetch;
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT" || init?.method === "POST") {
      seen.push({ url: String(input), body: JSON.parse(String(init.body)) });
      return Promise.resolve(
        new Response(JSON.stringify({ error: refusal, version: 9 }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return real(input, init);
  }) as typeof fetch;
  return seen;
}

/** What a refused write says, so a test can tell the server's message from one
 *  the client made up. */
const refusal = "the server said no, in its own words";

test("dropping a card in another column moves it and writes the change", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const writes = captureWrites();

  await dragTo(cardIn("todo", "A")!, columnEl("blocked"));

  // Moved on screen before the server has said anything, which is the point of
  // doing it optimistically.
  expect(cardIn("blocked", "A")).toBeTruthy();
  expect(cardIn("todo", "A")).toBeUndefined();

  // The column's value, and the version the board was read at.
  // The lane half is empty: released over the column but not over one of its
  // bands, the drop says nothing about lanes and the card keeps the one it had.
  expect(writes).toEqual([
    { url: "/api/card/notes/notes/a.md", body: { value: "blocked", lane: "", version: 1 } },
  ]);
});

// A card that snaps back is telling you the truth arrived: the write was refused
// because somebody else had changed the entry underneath.
test("a refused move puts the card back", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  captureWrites(409);

  await dragTo(cardIn("todo", "A")!, columnEl("blocked"));

  expect(cardIn("todo", "A")).toBeTruthy();
  expect(cardIn("blocked", "A")).toBeUndefined();
});

// The browser synthesizes a click from the press and the release however far the
// pointer travelled between them, so without suppressing it, finishing a drag on
// a card also opens the card.
test("finishing a drag does not also open the card", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const writes = captureWrites();

  // Released over nothing, so the board is unchanged and the card is still the
  // element the click would land on.
  const card = cardIn("todo", "A")!;
  await dragTo(card, null);
  await act(async () => card.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(writes).toEqual([]);
  expect(Boolean(document.querySelector('[role="dialog"]'))).toBe(false);
});

// …and the click a card exists for still works, which is what the movement
// threshold is for.
test("a press that does not move still opens the card", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const writes = captureWrites();

  const card = cardIn("todo", "A")!;
  const at = (type: string, x: number, y: number) =>
    card.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
  await act(async () => void at("pointerdown", 10, 10));
  // A hand is not perfectly still, and a card that needs one to open is broken.
  await act(async () => void at("pointermove", 12, 11));
  await act(async () => void at("pointerup", 12, 11));
  await act(async () => card.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(Boolean(document.querySelector('[role="dialog"]'))).toBe(true);
  expect(writes).toEqual([]);
});

// Dropping onto the column of entries with no status would mean *removing* the
// field, which is a different operation wearing the same gesture. So that column
// is not a target at all.
test("the column of entries with no status takes no drops", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const writes = captureWrites();

  // No `data-drop`, so a pointer over it finds no target and the drop is a
  // gesture that ends where it started.
  const unset = columnEl("no status");
  expect(unset.hasAttribute("data-drop")).toBe(false);

  await dragTo(cardIn("todo", "A")!, unset);

  expect(writes).toEqual([]);
  expect(cardIn("todo", "A")).toBeTruthy();
});

// Opening the section to a list of one thing you then have to click is a step
// that buys nothing.
test("opening the boards section picks the first board", async () => {
  await mountAt("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // A board is on screen without anything having been clicked in the list.
  expect(document.querySelectorAll("main section[aria-label]").length).toBeGreaterThan(0);
});

// Loading a board URL directly used to light the Entries icon and open the file
// tree beside a kanban, because the rail started at a guess and only a click
// ever corrected it.
test("loading a board URL shows the boards section, not the tree", async () => {
  await mountAt("/kanban/3-reader");

  // The rail, not the panel: with one board the boards panel starts closed, and
  // which section is lit is the thing being asserted.
  expect(activeSection()).toBe("Boards");
  const listed = [...document.querySelectorAll("aside a")].map((a) => a.textContent);
  expect(listed.join()).not.toContain("Index"); // not the file tree
});

// …and opening the section must not move you off the board you are on.
test("opening the section leaves the board you are on alone", async () => {
  await mountAt("/kanban/3-reader");
  // Already on Boards, so the icon is the panel's toggle rather than a way back
  // to a board you are already looking at.
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // The declared board is listed…
  const listed = [...document.querySelectorAll("aside a")].map((a) => a.textContent);
  expect(listed.join()).toContain("Notes");
  // …and you were not moved onto it.
  expect(here).toBe("/kanban/3-reader");
});

/** Which rail icon is lit. */
function activeSection(): string | null {
  const button = document.querySelector("nav[aria-label='Sections'] button[aria-current='page']");
  return button?.getAttribute("aria-label") ?? null;
}

/** Clicks the rail's Boards icon, the way opening that section happens. */
function openBoardsSection() {
  openSection("Boards");
}

// Picking a board collapsed the panel and nothing reopened it: every rail icon
// then changed a hidden panel, so clicking any of them did nothing you could
// see. The rail is now the only way back, which is what these two pin down.
test("one board is opened without spending width on a list of one", async () => {
  await mountAt("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // The board is on screen and the panel stayed out of the way.
  expect(document.querySelectorAll("main section[aria-label]").length).toBeGreaterThan(0);
  expect(document.querySelectorAll("aside a").length).toBe(0);

  // Clicking the section again is the way to the list, which is where a second
  // board would be added from. Without this the single-board rule is a trap.
  await act(async () => openBoardsSection());
  const listed = [...document.querySelectorAll("aside a")].map((a) => a.textContent);
  expect(listed.join()).toContain("Notes");
});

// The rail has to bring the panel back whatever it was last doing, or an icon
// that changes a hidden panel is an icon that does nothing.
test("the rail reopens the panel from a board", async () => {
  await mountAt("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(document.querySelectorAll("aside a").length).toBe(0);

  await act(async () => openSection("Entries"));
  const panel = [...document.querySelectorAll("aside a")].map((a) => a.textContent);
  expect(panel.join()).toContain("Index");
});

// Clicking a section you are already in collapses the panel, so the rail both
// gives the width and takes it back.
test("the active rail icon collapses the panel", async () => {
  await mountAt("/wiki/index.md");
  expect(document.querySelectorAll("aside a").length).toBeGreaterThan(0);

  await act(async () => openSection("Entries"));
  expect(document.querySelectorAll("aside a").length).toBe(0);
});

// Coming back to Entries from a board should land where opening the app lands,
// rather than on whatever the router last had.
test("returning to entries from a board opens the front door", async () => {
  await mountAt("/kanban/3-reader");
  await act(async () => openSection("Entries"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(document.querySelector("article")?.textContent).toContain("Where the bundle starts.");
});

// ─── Recently changed, and read later ───────────────────────────────────────

/**
 * Serves a tree in which something moved, and tells the app so over the stream.
 *
 * The greeting first, which is what the server sends on connect and the client
 * swallows, then the version that actually reports the change.
 */
async function reportTree(next: TreeNode, version: number): Promise<() => void> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    String(input).endsWith("/api/tree")
      ? Promise.resolve(
          new Response(JSON.stringify(next), { headers: { "content-type": "application/json" } }),
        )
      : realFetch(input, init)) as typeof fetch;
  await act(async () => emitVersion(1));
  await act(async () => emitVersion(version));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  return () => {
    globalThis.fetch = realFetch;
  };
}

/** The rows of a listing in the view area, as text. */
/** The reader's properties start folded; tests about what is in them start
 *  with them open, the way a reader who wants them has them. */
function openProperties() {
  localStorage.setItem(`wiki:${bundle.id}:reader:properties`, "true");
}

function pageRows(): string[] {
  return [...document.querySelectorAll("main li a")].map((a) => a.textContent ?? "");
}

function queueButton(within = "article"): HTMLElement | null {
  return document.querySelector<HTMLElement>(`${within} [aria-label='Save to read later']`);
}

// A folder dot says "something in here moved", which after a change across
// thirty files means opening folders until you find them. The list says it.
test("what changed is a page, newest first, naming where each entry lives", async () => {
  await mountAt("/wiki/index.md");
  // Two entries move in one rebuild each, checks.md after b.md.
  const restore = await reportTree(
    withChangedAt(withChange("/notes/b.md", 2), "/notes/checks.md", 3),
    3,
  );

  await act(async () => openSection("Recently changed"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(here).toBe("/changed");

  const rows = pageRows();
  expect(rows.length).toBe(2);
  // Most recent first. `changedAt` counts rebuilds, not seconds, so this is the
  // only ordering there is to state — and it is exact.
  expect(rows[0]).toContain("Checks");
  expect(rows[1]).toContain("B");
  // Where it lives, named the way the tree names it rather than as a raw path.
  expect(rows[1]).toContain("Notes");
  expect(rows[1]).not.toContain("/notes");
  // And the heading says what the page is, since a list of filenames does not.
  expect(document.querySelector("main h1")?.textContent).toBe("Recently changed");
  expect(document.querySelector("main")?.textContent).toContain("takes it off this list");

  restore();
});

// The whole reason this is a page and not a panel: the row leaves the list when
// you open it, and a handle that deletes itself under the cursor sends the next
// click somewhere you did not aim at.
test("reading an entry takes it off the changed page, which then says so", async () => {
  await mountAt("/wiki/index.md");
  const restore = await reportTree(withChange("/notes/b.md", 2), 2);

  await act(async () => navigateTo("/changed"));
  expect(pageRows().length).toBe(1);

  await act(async () => navigateTo("/wiki/notes/b.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => navigateTo("/changed"));

  expect(pageRows()).toEqual([]);
  // An empty state that is an answer rather than an apology.
  expect(document.querySelector("main")?.textContent).toContain("Nothing has changed");

  restore();
});

// Not everything that changed is worth opening: a title tweak you can judge from
// the row clears with an X, which is the same mark opening would set, so the tree
// agrees and read-later is untouched.
test("a changed entry can be dismissed from the list without opening it", async () => {
  // Save /notes/b.md, so we can prove dismissing it from *changed* leaves it in
  // read-later: two lists, two questions.
  localStorage.setItem(`wiki:${bundle.id}:queue`, JSON.stringify(["/notes/b.md"]));
  await mountAt("/wiki/index.md");
  const restore = await reportTree(
    withChangedAt(withChange("/notes/b.md", 2), "/notes/checks.md", 2),
    2,
  );

  await act(async () => navigateTo("/changed"));
  expect(pageRows().length).toBe(2);

  // Dismiss b.md where it stands.
  const x = [...document.querySelectorAll("main li")]
    .find((li) => (li.textContent ?? "").includes("B"))!
    .querySelector<HTMLElement>("[aria-label^='Mark']")!;
  await act(async () => x.click());

  const rows = pageRows();
  expect(rows.length).toBe(1);
  expect(rows.join()).not.toContain("B");
  // Still saved: the X touched seen, not the queue.
  await act(async () => navigateTo("/read-later"));
  expect(pageRows().join()).toContain("B");

  restore();
});

test("mark-all clears the whole changed list at once", async () => {
  await mountAt("/wiki/index.md");
  const restore = await reportTree(
    withChangedAt(withChange("/notes/b.md", 2), "/notes/checks.md", 2),
    2,
  );

  await act(async () => navigateTo("/changed"));
  expect(pageRows().length).toBe(2);

  const all = [...document.querySelectorAll("main button")].find((b) =>
    (b.textContent ?? "").startsWith("Mark all"),
  )!;
  expect(all.textContent).toContain("2"); // the count is the warning
  await act(async () => (all as HTMLElement).click());
  expect(pageRows()).toEqual([]);

  restore();
});

// A long frontmatter value used to overflow its chip and slide under the print
// and read-later buttons, covering them. No layout engine here to measure the
// overlap, so this pins the structural fix: the value can shrink and truncate,
// and the buttons are still in the document.
test("a long frontmatter value is capped so it cannot cover the buttons", async () => {
  openProperties();
  await mountAt("/wiki/notes/a.md");

  // `status: todo` is a plain value; find its chip's value span.
  const value = [...document.querySelectorAll("article dl dd span")].find(
    (s) => s.textContent === "todo",
  )!;
  expect(value.className).toContain("truncate");
  expect(value.className).toContain("max-w-");
  expect(value.getAttribute("title")).toBe("todo"); // full text on hover

  // The floats it used to sit under are present and marked as controls.
  expect(Boolean(document.querySelector("article [aria-label='Print this entry']"))).toBe(true);
  expect(Boolean(document.querySelector("article [aria-label='Save to read later']"))).toBe(true);
});

// "Index" names every folder's front door and so names none of them. In the tree
// the folder it sits in is right there on screen; in a list of rows it is not, so
// the folder is the name — the rule the server already applies to a backlink.
test("an index entry is named by its folder in both lists", async () => {
  const withIndexes: TreeNode = {
    ...tree,
    children: tree.children.map((c) =>
      c.path === "/notes"
        ? {
            ...c,
            index: "/notes/index.md",
            entries: [
              ...c.entries,
              { path: "/notes/index.md", name: "index.md", type: "", label: "Index", changedAt: 2, links: 0 },
            ],
          }
        : c,
    ),
  };

  // Saved from a list is not a thing you can do, so seed what saving would have
  // written and read the page back.
  localStorage.setItem(
    `wiki:${bundle.id}:queue`,
    JSON.stringify(["/notes/index.md", "/index.md"]),
  );
  await mountAt("/wiki/notes/a.md");
  const restore = await reportTree(withIndexes, 2);

  await act(async () => navigateTo("/read-later"));
  const saved = pageRows();
  expect(saved[0]).toContain("Notes (index)");
  expect(saved[0]).not.toBe("Index");
  // The bundle root's own front door is named by the bundle, since that is the
  // folder it is the front door of.
  expect(saved[1]).toContain("My kb (index)");
  // And the folder is not repeated underneath a name that already says it.
  expect(saved[0]).not.toContain("Notes (index)Notes");

  // The same name on the changed page, which is where it was noticed.
  await act(async () => navigateTo("/changed"));
  expect(pageRows().join()).toContain("Notes (index)");

  // The tree still calls it Index: the folder is drawn around it there.
  await act(async () => navigateTo("/wiki/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const inTree = [...document.querySelectorAll("aside a")].map((a) => a.textContent ?? "");
  expect(inTree.some((row) => row.includes("Index"))).toBe(true);
  expect(inTree.some((row) => row.includes("(index)"))).toBe(false);

  restore();
});

test("the rail names five working sections, and the two lists open no panel", async () => {
  await mountAt("/wiki/index.md");

  const labels = [...document.querySelectorAll("nav[aria-label='Sections'] button")].map((b) =>
    b.getAttribute("aria-label"),
  );
  // Named for what they are for, not for the state they hold.
  expect(labels).toEqual(["Entries", "Boards", "Graphs", "Recently changed", "Read later"]);
  // The section that answered a click with an apology is gone until it can keep
  // the promise.
  expect(labels).not.toContain("Search");

  for (const label of ["Recently changed", "Read later"]) {
    await act(async () => openSection(label));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(activeSection()).toBe(label);
    expect(document.querySelector("aside")?.getAttribute("data-open")).toBe("false");

    // A second click has nothing to toggle. Opening an empty panel is the bug.
    await act(async () => openSection(label));
    expect(document.querySelector("aside")?.getAttribute("data-open")).toBe("false");
  }
});

// The difference from the changed list: opening a saved entry does not consume
// it, so the list is still there when you come back for the next one.
test("a saved entry names itself, keeps its place, and comes off when you say", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => queueButton()!.click());
  // The control now says what it would do next.
  expect(Boolean(document.querySelector("article [aria-label='Remove from read later']"))).toBe(
    true,
  );

  await act(async () => openSection("Read later"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(here).toBe("/read-later");

  // What the entry calls itself, not the filename the tree names it by: this is
  // a list of things to read.
  expect(pageRows()[0]).toContain("A Note");
  // And where it lives, readable.
  expect(pageRows()[0]).toContain("Notes");
  expect(document.querySelector("main li a")?.getAttribute("href")).toBe("/wiki/notes/a.md");

  // Reading it leaves it on the list, which is the whole difference from the
  // other one.
  await act(async () => navigateTo("/wiki/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => navigateTo("/read-later"));
  expect(pageRows().length).toBe(1);

  // Taken off explicitly, from the row, because opening it never will.
  await act(async () =>
    document.querySelector<HTMLElement>("main li [aria-label^='Remove']")!.click(),
  );
  expect(pageRows()).toEqual([]);
  expect(document.querySelector("main")?.textContent).toContain("Nothing saved.");
});

test("the read-later list survives a reload and does not leak into another bundle", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => queueButton()!.click());

  // A reload: same browser, same bundle, fresh mount.
  await mountAt("/read-later");
  expect(pageRows()[0]).toContain("A Note");

  // Another bundle's list is not this one's: these are paths, and a path from one
  // bundle may name nothing in another.
  localStorage.clear();
  localStorage.setItem("wiki:another-bundle:queue", JSON.stringify(["/notes/a.md"]));
  await mountAt("/read-later");
  expect(pageRows()).toEqual([]);
  expect(document.querySelector("main")?.textContent).toContain("Nothing saved.");
});

// A list that quietly loses things is a list you stop trusting, and the only
// useful thing left to do with a path that has gone is take it off yourself.
test("a saved entry that no longer exists is said, not dropped", async () => {
  localStorage.setItem(`wiki:${bundle.id}:queue`, JSON.stringify(["/notes/vanished.md"]));
  await mountAt("/read-later");

  const page = document.querySelector("main")!;
  expect(pageRows()[0]).toContain("vanished.md");
  // Said on a second line, not with a bare tag, and not with a folder it no
  // longer lives in.
  expect(page.textContent).toContain("Entry not found in this bundle");
  expect(Boolean(page.querySelector("[aria-label^='Remove']"))).toBe(true);
});

// Two marks on one row is the case to design for, not the exception. Different
// shapes rather than different colours: two coloured dots side by side have to
// be read against each other, which is not reading at this size.
test("a saved entry and a changed one are told apart on the same tree row", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => queueButton()!.click());
  // Look away, so what happens to it next is news: the entry you are reading is
  // never marked, whoever changed it.
  await act(async () => navigateTo("/wiki/index.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const restore = await reportTree(withChange("/notes/a.md", 2), 2);

  const row = [...document.querySelectorAll("aside a")].find(
    (a) => a.getAttribute("href") === "/wiki/notes/a.md",
  )!;
  const saved = row.querySelector('[aria-label="read later"]')!;
  const changed = row.querySelector('[aria-label="changed"]')!;
  expect(Boolean(saved)).toBe(true);
  expect(Boolean(changed)).toBe(true);
  // A glyph and a dot, not two dots: the marks differ in shape, so neither has
  // to be read against the other.
  expect(Boolean(saved.querySelector("svg"))).toBe(true);
  expect(changed.querySelector("svg")).toBeNull();

  // Both marks live in fixed-width slots, in a stable order, so a row with one
  // mark lands it in the same column as a row with both. The group holds two
  // slot cells whatever a row carries.
  const group = saved.closest("span.flex")!;
  const slots = [...group.children];
  expect(slots.length).toBe(2);
  expect(slots[0]!.contains(saved)).toBe(true); // bookmark first
  expect(slots[1]!.contains(changed)).toBe(true); // dot outermost

  restore();
});

// The order is the reader's, and the arrows on the handle are the keyboard half
// of the drag: a reorder that only a mouse can do is one some people cannot.
test("read-later can be reordered from the keyboard, and it persists", async () => {
  localStorage.setItem(
    `wiki:${bundle.id}:queue`,
    JSON.stringify(["/notes/a.md", "/notes/b.md", "/notes/checks.md"]),
  );
  await mountAt("/read-later");
  expect(pageRows().map((r) => r.replace(/\s+/g, " ").trim())[0]).toContain("A Note");

  // Move the first row down one with the arrow key on its handle.
  const handle = document.querySelector<HTMLElement>("main li [aria-label^='Reorder']")!;
  await act(async () => {
    handle.focus();
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
  });

  // A Note is now second; B first.
  expect(pageRows()[0]).toContain("B");
  expect(pageRows()[1]).toContain("A Note");

  // And it survives a reload, because the order is what is stored.
  await mountAt("/read-later");
  expect(pageRows()[0]).toContain("B");
  expect(pageRows()[1]).toContain("A Note");
});

// Reorder may only permute what is stored: a stale order cannot add a path the
// queue does not have or drop one it does, or "set the order" becomes a way to
// edit the list behind its own back.
test("reordering cannot add or lose entries", async () => {
  localStorage.setItem(`wiki:${bundle.id}:queue`, JSON.stringify(["/notes/a.md", "/notes/b.md"]));
  await mountAt("/read-later");

  // The last row cannot move further down: the nudge clamps rather than growing
  // the list or wrapping.
  const handles = [...document.querySelectorAll<HTMLElement>("main li [aria-label^='Reorder']")];
  await act(async () => {
    handles[1]!.focus();
    handles[1]!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
  });
  expect(pageRows().length).toBe(2);
  expect(pageRows()[1]).toContain("B");
});

// One entry has nothing to reorder, so its handle would be an affordance that
// does nothing. The remove control stays.
test("a single saved entry offers no reorder handle", async () => {
  localStorage.setItem(`wiki:${bundle.id}:queue`, JSON.stringify(["/notes/a.md"]));
  await mountAt("/read-later");
  expect(Boolean(document.querySelector("main li [aria-label^='Reorder']"))).toBe(false);
  expect(Boolean(document.querySelector("main li [aria-label^='Remove']"))).toBe(true);
});

// A board you cannot queue anything from would be a hole in the feature rather
// than a decision. The card is the reader in a dialog, so it comes for free.
test("a card can be saved to read later from the sheet", async () => {
  await mountAt("/wiki/index.md");
  const restore = stubBoard();
  await act(async () => navigateTo("/kanban/notes/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const button = queueButton("[role='dialog']");
  expect(Boolean(button)).toBe(true);
  await act(async () => button!.click());
  expect(
    Boolean(document.querySelector("[role='dialog'] [aria-label='Remove from read later']")),
  ).toBe(true);

  restore();
});

/** Clicks a rail icon by its label. */
function openSection(label: string) {
  const button = [...document.querySelectorAll("nav[aria-label='Sections'] button")].find(
    (b) => b.getAttribute("title") === label,
  ) as HTMLElement | undefined;
  if (!button) throw new Error(`no ${label} section in the rail`);
  button.click();
}

/**
 * Mounts with the bundle declaring no boards, which is where a fresh bundle
 * starts and where the empty states have to hold up.
 */
async function mountWithNoBoards(path: string, board?: unknown) {
  await mountAt("/wiki/index.md");
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/bundle")) {
      return Promise.resolve(
        new Response(JSON.stringify({ ...bundle, boards: undefined }), {
          headers: { "content-type": "application/json" },
        }),
      );
    }
    if (board && url.includes("/api/board/")) {
      return Promise.resolve(
        new Response(JSON.stringify(board), { headers: { "content-type": "application/json" } }),
      );
    }
    return real(input, init);
  }) as typeof fetch;
  // A version the app has not seen refetches the bundle, which is how the new
  // stub takes effect without remounting. The first message is the stream's
  // greeting, which the app deliberately does not act on.
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => navigateTo(path));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

/** The dialog that declares a view, opened from its button inside `within`. */
async function openNew(within: Element, noun: "board" | "graph"): Promise<HTMLElement> {
  const button = [...within.querySelectorAll("button")].find((b) => b.textContent?.trim() === `New ${noun}`);
  if (!button) throw new Error(`no New ${noun} button`);
  await act(async () => button.click());
  // The draft is fetched on open, and the filter waits for it.
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = document.querySelector<HTMLElement>(`[aria-label='New ${noun}']`);
  if (!dialog) throw new Error(`New ${noun} did not open a dialog`);
  return dialog;
}

// The empty state of a feature is the one moment somebody will read how it
// works, so it offers the way to make one rather than a note about what to
// hand-write into wiki.toml.
test("with no boards declared the panel offers to make one", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const panel = document.querySelector("aside")!;
  // A button in the panel, and the form in a dialog over everything.
  expect(panel.querySelector("form")).toBeNull();
  const dialog = await openNew(panel, "board");
  // The folders that hold entries, and only those.
  const options = [...dialog.querySelectorAll("select:not([aria-label]) option")].map((o) => o.getAttribute("value"));
  expect(options).toEqual(["/", "/notes"]);
  // The id is suggested from the name rather than left for you to invent.
  expect(dialog.querySelector<HTMLInputElement>("input[aria-label='Board id']")?.value).toBe("my-kb");
  // The filter starts at the server's default, which is tasks, and can be
  // changed before the board exists rather than only after.
  expect(chips(dialog)).toEqual(["typeistask"]);
  expect([...new Set(drafts)]).toEqual(["/api/draft/board/"]);
});

// The board `root` matches nothing in a bundle of notes, and it used to render a
// blank page: the server sent `columns: null` and the view read a list it had
// been promised.
test("a board with nothing on it says why, and offers a way out", async () => {
  const empty = { path: "/", id: "root", name: "My kb", field: "status", where: ["type=task"], declared: false, columns: [] };
  await mountWithNoBoards("/kanban/root", empty);

  const main = document.querySelector("main")!;
  expect(main.textContent).toContain("Nothing on this board");
  // The reason, which is not guessable from anything on screen.
  expect(main.textContent).toContain("matching type=task");
  await openNew(main, "board");
});

// A board you declared over a folder with no cards yet was set up ahead of its
// cards: it says what will fill it — by its own filter, not by the default —
// and does not send you to another folder.
test("a declared board with no cards yet says what will fill it", async () => {
  const empty = {
    path: "/notes", id: "later", name: "Later", field: "status", declared: true, columns: [],
    where: ["type=idea", "status!=done"],
  };
  await mountWithNoBoards("/kanban/later", empty);

  const main = document.querySelector("main")!;
  expect(main.textContent).toContain("No cards yet");
  expect(main.textContent).toContain("An entry under /notes matching type=idea and status!=done becomes a card here.");
  expect(main.textContent).not.toContain("type=task");
  expect([...main.querySelectorAll("button")].some((b) => b.textContent?.includes("New board"))).toBe(false);
});

// With no filter, every entry is a card, and saying "matching" nothing would
// read as a sentence with a hole in it.
test("a board of every entry says so when it is empty", async () => {
  const empty = { path: "/notes", id: "all", name: "All", field: "status", declared: true, columns: [], where: [] };
  await mountWithNoBoards("/kanban/all", empty);
  expect(document.querySelector("main")!.textContent).toContain("Any entry under /notes becomes a card here.");
});

// Declaring a board is a config write, and the only thing worth asserting is
// that it goes out as one and lands you on the board it made.
test("declaring a board writes it and opens it", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = await openNew(document.querySelector("aside")!, "board");

  const writes = captureWrites();
  await act(async () => submit(dialog));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // The id the form suggested is the id that gets written, and the folder, the
  // name and the filter go with it.
  expect(writes).toEqual([
    { url: "/api/board", body: { id: "my-kb", path: "/", name: "My kb", where: ["type=task"] } },
  ]);
  expect(here).toBe("/kanban/my-kb");
  // Done with: the panel stays mounted across the navigation, the dialog not.
  expect(document.querySelector("[aria-label='New board']")).toBeNull();
});

// An empty filter is a choice — every entry under the folder — and is sent as
// one, rather than left out and turned back into tasks by the default.
test("a board can be declared with no filter at all", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = await openNew(document.querySelector("aside")!, "board");

  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Remove filter 1']")!.click());
  expect(chips(dialog)).toEqual([]);
  expect(dialog.textContent).toContain("every entry in the folder is a card");

  const writes = captureWrites();
  await act(async () => submit(dialog));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(writes[0]?.body.where).toEqual([]);
});

// The keys follow the folder, since they are what there is to filter by; the
// filter does not, because once it is on screen it is yours.
test("choosing another folder asks for its keys and keeps the filter", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = await openNew(document.querySelector("aside")!, "board");
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Remove filter 1']")!.click());

  const folder = dialog.querySelector<HTMLSelectElement>("select:not([aria-label])")!;
  await act(async () => {
    folder.value = "/notes";
    folder.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect([...new Set(drafts)]).toEqual(["/api/draft/board/", "/api/draft/board/notes"]);
  expect(chips(dialog)).toEqual([]);
});

// The server owns which ids are valid and which are taken, so a refusal is shown
// rather than second-guessed here — and nothing navigates.
test("a refused board keeps you on the form and says why", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = await openNew(document.querySelector("aside")!, "board");

  captureWrites(422);
  await act(async () => submit(dialog));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(dialog.textContent).toContain(refusal);
  expect(document.querySelector("[aria-label='New board']")).not.toBeNull();
  expect(here).toBe("/wiki/index.md");
});

/**
 * Submits the form inside an element.
 *
 * Only the submit, never the typing: React 19 does not act on an `input` event
 * dispatched under happy-dom, so a field's value here is whatever the form put
 * there. Which is the part with a rule in it — the id is suggested rather than
 * demanded — and the assertions below are about that.
 */
function submit(within: Element) {
  const form = within.matches("form") ? within : within.querySelector("form")!;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

// A list with no way to add to it means editing wiki.toml by hand for the second
// board, which is the dead end the empty state already avoids.
test("the boards list can add another", async () => {
  // From a board, where the icon is the panel's toggle: with one board declared
  // the boards panel starts closed, so one click is what opens the list.
  await mountAt("/kanban/notes");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const panel = document.querySelector("aside")!;
  expect(Boolean(panel.querySelector("form"))).toBe(false); // the list, not a form
  await openNew(panel, "board");
});

// Renaming a status in the entries makes an inferred column vanish and leaves a
// pinned one empty, so showing them the same way makes the config feel haunted.
test("pinned columns are told apart from the ones the entries happen to have", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const marked = (value: string) => Boolean(columnEl(value).querySelector("header [title*='Pinned']"));
  expect(marked("todo")).toBe(true);
  expect(marked("in-progress")).toBe(true);
  expect(marked("blocked")).toBe(false);
});

// Order is a thing only config has: inference gives the columns that exist and
// nothing more. So reordering writes the whole list, and pins it.
test("dragging a column header writes the new order", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const writes = captureWrites();

  await dragTo(columnEl("blocked").querySelector("header")!, columnEl("todo"));

  expect(writes).toEqual([
    {
      url: "/api/board/notes",
      body: {
        name: "Notes",
        status: "status",
        lane: "priority",
        blockers: "blockers",
        where: ["type=task", "priority!=low"],
        // The unnamed column is left out: it is not a status anybody declared.
        columns: ["blocked", "todo", "in-progress"],
        // Nor is the unnamed band.
        lanes: ["high", "low"],
      },
    },
  ]);
  // And on screen at once, rather than after a round trip.
  const order = [...document.querySelectorAll("main section[aria-label]")].map((s) =>
    s.getAttribute("aria-label"),
  );
  expect(order).toEqual(["blocked", "todo", "in-progress", "no status"]);
});

// The unnamed column is not a status anybody wrote, so there is no place for it
// in a list of declared ones — and nothing to drag.
test("the column of entries with no status is not draggable", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const writes = captureWrites();

  await dragTo(columnEl("no status").querySelector("header")!, columnEl("todo"));

  expect(writes).toEqual([]);
});

test("the settings form opens seeded from the board", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  expect(dialog.querySelector<HTMLSelectElement>("[aria-label='Status field']")?.value).toBe("status");
  expect(dialog.querySelector<HTMLSelectElement>("[aria-label='Lane field']")?.value).toBe("priority");

  // The pinned columns, in order: the list *is* the config value, so being in it
  // is what pinning means and where in it is the order.
  const pinned = () => pinnedIn(dialog);
  expect(pinned()).toEqual(["todo", "in-progress"]);

  // And what the entries have that nothing has pinned, one click each rather
  // than retyping a value already on screen.
  const offered = [...dialog.querySelectorAll("button")]
    .map((b) => b.getAttribute("aria-label"))
    .filter((l) => l?.startsWith("Pin "));
  expect(offered).toEqual(["Pin blocked"]);
});

// Order is the one thing a set of checkboxes cannot say, and it was previously
// only sayable by hand-editing wiki.toml.
test("the settings form reorders an axis", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  const pinned = () => pinnedIn(dialog);
  const click = (label: string) =>
    dialog.querySelector<HTMLElement>(`[aria-label='${label}']`)!.click();

  expect(pinned()).toEqual(["todo", "in-progress"]);
  await act(async () => click("Move in-progress up"));
  expect(pinned()).toEqual(["in-progress", "todo"]);

  const writes = captureWrites();
  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(writes[0]?.body.columns).toEqual(["in-progress", "todo"]);
});

// Lanes are the axis that had no control at all: the order was config-file-only.
test("the lanes tab orders lanes, and says so when there are none", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  const tab = (name: string) =>
    [...dialog.querySelectorAll("[role=tab]")].find((t) => t.textContent === name) as HTMLElement;
  await act(async () => tab("lanes").click());

  const pinned = () => pinnedIn(dialog);
  expect(pinned()).toEqual(["high", "low"]);
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Move low up']")!.click());
  expect(pinned()).toEqual(["low", "high"]);

  const writes = captureWrites();
  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(writes[0]?.body.lanes).toEqual(["low", "high"]);

});

// With no lane field the tab says so rather than being absent: a tab that is not
// there reads as a feature that does not exist, and the fix is one control up.
test("the lanes tab explains itself on a board without lanes", async () => {
  await mountAt("/wiki/index.md");
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/api/board/") && init?.method === undefined) {
      const { lane, lanes, ...rest } = boardFixture;
      void lane;
      void lanes;
      return Promise.resolve(
        new Response(JSON.stringify(rest), { headers: { "content-type": "application/json" } }),
      );
    }
    return real(input, init);
  }) as typeof fetch;
  await act(async () => navigateTo("/kanban/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  const lanes = [...dialog.querySelectorAll("[role=tab]")].find(
    (t) => t.textContent === "lanes",
  ) as HTMLElement;
  await act(async () => lanes.click());
  expect(dialog.textContent).toContain("No lane field");
});

// Recalling whether this bundle spells it `status` or `state` is the mistake
// worth designing out: a typo there is a board with one column.
test("the field pickers offer the keys the folder actually has", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  // The filter's keys are in its editor, open on a condition.
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Edit filter 1']")!.click());
  const options = (label: string) =>
    [...(dialog.querySelector(`[aria-label='${label}']`)?.querySelectorAll("option") ?? [])].map(
      (o) => o.textContent,
    );

  // `tags` is missing from both: a column or a lane is one value, and a list has
  // many. It is still there to filter on, where membership is what it means.
  expect(options("Status field")).toEqual(["priority", "status", "title", "type"]);
  expect(options("Filter key")).toEqual(["priority", "status", "tags", "title", "type"]);
  // A lane is allowed to be none, and the status field is not.
  expect(options("Lane field")).toEqual(["— no lanes —", "priority", "status", "title", "type"]);
});

/** The filter's conditions as their chips read. */
const chips = (dialog: Element) => [...dialog.querySelectorAll("[aria-label^='Edit filter']")].map((c) => c.textContent);

// `key=value` is a small language, but one nobody should have to be told: both
// halves are known, and a mistyped one empties the board rather than complaining.
test("the filter reads as chips, and a chip can be removed", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  // `!=` is read before `=`, which is the engine's own order: the other way
  // round, `priority!=low` would be the key `priority!` equal to `low`.
  expect(chips(dialog)).toEqual(["typeistask", "priorityis notlow"]);
  // Nothing to type into until a condition is opened.
  expect(dialog.querySelector("[aria-label='Filter key']")).toBeNull();

  const writes = captureWrites();
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Remove filter 1']")!.click());
  expect(chips(dialog)).toEqual(["priorityis notlow"]);

  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // The rows round-trip back to the spelling they came from.
  expect(writes[0]?.body.where).toEqual(["priority!=low"]);
});

// A chip opens in the editor under the chips. Edits apply as they are made, so
// there is no draft for the dialog's Save to miss; Enter and Escape finish the
// condition, and neither submits nor closes the dialog.
test("a chip edits in place, and + Filter adds one open for editing", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());
  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  const value = () => dialog.querySelector<HTMLInputElement>("[aria-label='Filter value']");
  const writes = captureWrites();

  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Edit filter 2']")!.click());
  expect(dialog.querySelector<HTMLSelectElement>("[aria-label='Filter key']")?.value).toBe("priority");
  expect(dialog.querySelector<HTMLSelectElement>("[aria-label='Filter operator']")?.value).toBe("!=");
  // A value is typed, not picked: a filter is often written before the entries
  // catch up. What the key already holds is a suggestion, and empty is a value
  // (`status=` matches an entry with no status), which an empty box does not
  // say for itself.
  expect(value()?.tagName).toBe("INPUT");
  const suggestions = [...document.getElementById(value()!.getAttribute("list")!)!.querySelectorAll("option")];
  expect(suggestions.map((o) => o.getAttribute("value"))).toEqual(["high", "low"]);
  expect(value()?.getAttribute("placeholder")).toBe("(nothing)");

  await act(async () => typeInto(value()!, "high"));
  expect(chips(dialog)).toEqual(["typeistask", "priorityis nothigh"]);
  // Enter finishes the condition. In a browser it would also submit the form,
  // which is the default it prevents (the test DOM submits nothing on Enter).
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => void value()!.dispatchEvent(enter));
  expect(enter.defaultPrevented).toBe(true);
  expect(value()).toBeNull();
  expect(writes).toEqual([]);

  // Escape closes the editor, not the dialog under it.
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Edit filter 1']")!.click());
  await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(value()).toBeNull();
  expect(document.querySelector("[aria-label='Board settings']")).not.toBeNull();

  // Added, it is a condition at once, open for editing.
  await act(async () => [...dialog.querySelectorAll("button")].find((b) => b.textContent === "+ Filter")!.click());
  expect(chips(dialog)).toEqual(["typeistask", "priorityis nothigh", "priorityis(nothing)"]);
  expect(dialog.querySelector("[aria-label='Edit filter 3']")?.getAttribute("aria-expanded")).toBe("true");
  // Removing one before it keeps the editor on the same condition...
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Remove filter 1']")!.click());
  expect(dialog.querySelector("[aria-label='Edit filter 2']")?.getAttribute("aria-expanded")).toBe("true");
  // ...and removing it closes the editor.
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Remove filter 2']")!.click());
  expect(value()).toBeNull();

  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(writes[0]?.body.where).toEqual(["priority!=high"]);
});

test("saving the settings form writes them", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const writes = captureWrites();
  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(writes).toEqual([
    {
      url: "/api/board/notes",
      body: {
        name: "Notes",
        status: "status",
        lane: "priority",
        blockers: "blockers",
        where: ["type=task", "priority!=low"],
        columns: ["todo", "in-progress"],
        lanes: ["high", "low"],
      },
    },
  ]);
  // Saved, so it closes.
  expect(Boolean(document.querySelector("[aria-label='Board settings']"))).toBe(false);
});

// The server owns whether a filter parses and whether the table can be edited at
// all, so a refusal is shown rather than second-guessed — and the form stays up
// with what you typed still in it.
test("a refused save keeps the form open and says why", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  captureWrites(422);
  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(dialog.textContent).toContain(refusal);
  expect(Boolean(document.querySelector("[aria-label='Board settings']"))).toBe(true);
});

/** Clicks the board's Settings button. */
function openSettings() {
  const button = [...document.querySelectorAll("main header button")].find(
    (b) => b.textContent === "Settings",
  ) as HTMLElement | undefined;
  if (!button) throw new Error("no Settings button on the board");
  button.click();
}

// A hand-written wiki.toml can hold a `where` that is not a filter. Reshaping it
// into something that parses would change what the board means without saying
// so, and the server is the one that reports it.
test("a condition that is not a filter is shown as written", async () => {
  await mountAt("/wiki/index.md");
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/api/board/") && init?.method === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ ...boardFixture, where: ["type=task", "nonsense"] }), {
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return real(input, init);
  }) as typeof fetch;
  await act(async () => navigateTo("/kanban/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  // One condition, and the other shown as it was written rather than as a key
  // with an empty value: removable, not editable.
  expect(chips(dialog)).toEqual(["typeistask"]);
  expect(dialog.querySelector("[title='Not a filter']")?.textContent).toBe("nonsense");
  expect(dialog.querySelector("[aria-label='Remove filter 2']")).not.toBeNull();

  // And it goes back exactly as it came, so the server refuses it by name.
  const writes = captureWrites(422);
  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(writes[0]?.body.where).toEqual(["type=task", "nonsense"]);
});

// A text box beside a button: Enter is that button, not the dialog's Save. A
// nested form would be the other way to say so, and HTML does not allow one.
test("enter in the new-column box adds the column rather than saving", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const writes = captureWrites();
  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  const box = dialog.querySelector<HTMLInputElement>("[aria-label='New column']")!;
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => void box.dispatchEvent(enter));

  expect(enter.defaultPrevented).toBe(true);
  expect(writes).toEqual([]);
  expect(Boolean(document.querySelector("[aria-label='Board settings']"))).toBe(true);
});

// The complaint this rule exists for: switching section used to animate the
// panel shut, so clicking Boards from the reader played an empty pane collapsing
// — the app closing something you never opened.
test("switching section swaps the panel rather than animating one shut", async () => {
  await mountAt("/wiki/index.md");
  const panel = document.querySelector("aside")!;
  expect(panel.getAttribute("data-open")).toBe("true"); // the tree, open

  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // Closed, because one board is not a list worth width — and got there without
  // a transition to watch.
  expect(panel.getAttribute("data-open")).toBe("false");
  expect(panel.className).not.toContain("transition");

  // A toggle is something you did, so that one animates.
  await act(async () => openBoardsSection());
  expect(panel.getAttribute("data-open")).toBe("true");
  expect(panel.className).toContain("transition");
});

// Each section remembers its own width. One shared flag meant switching section
// argued with what you last did to the panel you left.
test("the panel remembers what each section was doing", async () => {
  await mountAt("/kanban/notes");
  const panel = document.querySelector("aside")!;

  // Open the boards list, then go to the reader and back.
  await act(async () => openBoardsSection());
  expect(panel.getAttribute("data-open")).toBe("true");
  await act(async () => openSection("Entries"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(panel.getAttribute("data-open")).toBe("true"); // the tree, which is open by default
  await act(async () => openSection("Entries")); // …and now closed
  expect(panel.getAttribute("data-open")).toBe("false");

  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // Boards is still open, rather than inheriting what Entries was just told.
  expect(panel.getAttribute("data-open")).toBe("true");
});

// A bundle with no boards has nowhere to navigate, so the click has to be worth
// making: the panel is where the first board gets declared.
test("with no boards the icon still opens the panel", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const panel = document.querySelector("aside")!;
  expect(panel.getAttribute("data-open")).toBe("true");
  expect([...panel.querySelectorAll("button")].some((b) => b.textContent?.trim() === "New board")).toBe(true);
});

// The router defers navigation into a transition; a setState here is urgent. So
// a stored section moved the panel a frame early: the entry you were still
// looking at reflowed into the new width, and only then became a board.
//
// Clicked with the act environment off, deliberately: inside one, React queues
// urgent work alongside the transition and flushes both together, which is
// exactly the difference this is trying to see.
test("the panel does not move until the view does", async () => {
  await mountAt("/wiki/index.md");
  const panel = document.querySelector("aside")!;
  const main = document.querySelector("main")!;
  expect(panel.getAttribute("data-open")).toBe("true");

  const flags = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  flags.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    openBoardsSection();
    // React flushes urgent work in a microtask and schedules transitions on a
    // later task, so this is the moment between the two — the frame the bug was
    // visible in.
    await Promise.resolve();
    await Promise.resolve();

    // The reader is still on screen, so the panel it sits beside must be too.
    expect(panel.getAttribute("data-open")).toBe("true");
    expect(main.textContent).toContain("Where the bundle starts.");
  } finally {
    flags.IS_REACT_ACT_ENVIRONMENT = true;
  }

  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // And now both, together.
  expect(panel.getAttribute("data-open")).toBe("false");
  expect(main.textContent).not.toContain("Where the bundle starts.");
});

// And the same the other way: the panel used to open beside the board before
// the reader arrived, so the kanban redrew inside the narrower width first.
test("the panel does not open until the reader arrives", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const panel = document.querySelector("aside")!;
  const main = document.querySelector("main")!;
  expect(panel.getAttribute("data-open")).toBe("false"); // one board, so no list

  const flags = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  flags.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    openSection("Entries");
    await Promise.resolve();
    await Promise.resolve();
    expect(panel.getAttribute("data-open")).toBe("false");
    expect(document.querySelectorAll("main section[aria-label]").length).toBeGreaterThan(0);
  } finally {
    flags.IS_REACT_ACT_ENVIRONMENT = true;
  }

  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(panel.getAttribute("data-open")).toBe("true");
  expect(main.textContent).toContain("The Front Door");
});

// Every navigation used to be a round trip, so there was a window with nothing
// correct to show. A copy taken on the way past closes it.
test("returning to an entry read earlier renders it with no request", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => navigateTo("/wiki/index.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const before = fetchCount();
  await act(async () => navigateTo("/wiki/notes/a.md"));
  // On screen in the same commit as the navigation, before any promise settles.
  expect(document.querySelector("main")?.textContent).toContain("The body of the entry.");
  expect(fetchCount()).toBe(before);

  // …and still nothing asked for once everything has settled.
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(fetchCount()).toBe(before);
});

// The freshness question is answered per entry, not per bundle. An agent editing
// something else is the common case while a bundle is open, and a bundle-wide
// check would refetch what you are reading every time it happened.
test("an edit to another entry does not refetch the one on screen", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // Both read once, so what follows is about revisiting rather than arriving.
  await act(async () => navigateTo("/wiki/index.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // A version the client has not seen: the bundle and tree refetch, and the tree
  // says which entry moved — not this one.
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const before = fetchCount();
  await act(async () => navigateTo("/wiki/index.md"));
  await act(async () => navigateTo("/wiki/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(fetchCount()).toBe(before);
});

// A copy is about latency, never about truth. When the file did change, the copy
// is shown and replaced rather than trusted.
test("an entry that changed on disk is refetched", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => navigateTo("/wiki/index.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // The tree now reports a.md as having moved at a later version than the copy
  // was taken at, which is the whole of the staleness rule.
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/tree")) {
      return Promise.resolve(
        new Response(JSON.stringify(withChangedAt(tree, "/notes/a.md", 99)), {
          headers: { "content-type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/entry/notes/a.md")) {
      return Promise.resolve(
        new Response(JSON.stringify({ ...entry, body: "# A Note\n\nRewritten on disk.\n", links: [] }), {
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return real(input, init);
  }) as typeof fetch;
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await act(async () => navigateTo("/wiki/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(document.querySelector("main")?.textContent).toContain("Rewritten on disk.");
});

// A tick that is not kept as well as shown reads as the write having failed:
// navigate away, come back, and the box is empty again.
test("a checkbox ticked survives navigating away and back", async () => {
  await mountAt("/wiki/notes/checks.md");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  captureWrites();

  const box = document.querySelector<HTMLInputElement>("main input[type=checkbox]")!;
  expect(box.checked).toBe(false);
  await act(async () => box.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await act(async () => navigateTo("/wiki/index.md"));
  await act(async () => navigateTo("/wiki/notes/checks.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(document.querySelector<HTMLInputElement>("main input[type=checkbox]")?.checked).toBe(true);
});

/** The tree with one entry's changedAt moved on, as a rebuild would report it. */
function withChangedAt(node: TreeNode, path: string, at: number): TreeNode {
  return {
    ...node,
    entries: node.entries.map((e) => (e.path === path ? { ...e, changedAt: at } : e)),
    children: node.children.map((c) => withChangedAt(c, path, at)),
  };
}

// One drag says where in both directions. Resolving only the column would make
// moving a card between lanes impossible without editing the file by hand.
test("dropping a card in a lane moves it there and to that column", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const writes = captureWrites();

  // The `low` band of `in-progress`, which holds no card and so does not exist
  // until the drag starts: a lane a column has not used yet is exactly the one
  // you cannot reach any other way.
  const band = () =>
    [...columnEl("in-progress").querySelectorAll("[data-lane]")].find(
      (el) => el.getAttribute("data-lane") === "low",
    ) ?? null;
  expect(band()).toBeNull();
  await dragTo(cardIn("todo", "A")!, band);

  expect(writes).toEqual([
    {
      url: "/api/card/notes/notes/a.md",
      body: { value: "in-progress", lane: "low", version: 1 },
    },
  ]);
  // And on screen at once, in the band it was dropped in.
  const moved = [...columnEl("in-progress").querySelectorAll("[data-lane]")].find(
    (el) => el.getAttribute("data-lane") === "low",
  )!;
  expect(moved.textContent).toContain("A");
});

// The unnamed band is not a lane anybody chose, so dropping into it would mean
// removing the field: the same operation the unnamed column refuses.
test("the band of cards with no lane takes no drops", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const unnamed = [...columnEl("todo").querySelectorAll("div")].find(
    (d) => d.querySelector("h3")?.textContent === "none",
  );
  expect(unnamed).toBeTruthy();
  expect(unnamed!.hasAttribute("data-lane")).toBe(false);
});

// Two opposite facts, so two badges: being blocked is a reason not to start,
// blocking others is a reason to. One mark would have said neither.
test("a card says what it waits on and what waits on it", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const card = cardIn("todo", "A")!;
  const badges = [...card.querySelectorAll("[title]")].map((b) => b.getAttribute("title"));
  expect(badges).toEqual(["Waiting on 2 entries", "Holding up 1 entry"]);

  // A card with no edges reports neither, rather than showing a row of noughts.
  expect(cardIn("blocked", "B")!.querySelectorAll("[title]").length).toBe(0);
});

// A card is an anchor, and an anchor is draggable by default: the browser starts
// its own link-drag on the first movement and stops sending pointer events, so
// no drag of ours ever begins.
//
// This is the one thing here a test cannot actually prove — a DOM with no
// renderer has no native drag to start, so every drag test passed while it was
// broken in every browser. Pinned instead, so removing the attribute is loud.
test("a card is not natively draggable", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(cardIn("todo", "A")!.getAttribute("draggable")).toBe("false");
});

// A flex child shrinks below its content by default, so a column with more cards
// than height drew them over each other.
test("cards and lane bands do not shrink", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(cardIn("todo", "A")!.className).toContain("shrink-0");
  const band = [...columnEl("todo").querySelectorAll("[data-lane]")][0]!;
  expect(band.className).toContain("shrink-0");
});

/** The values pinned on the axis tab that is open, in order. */
function pinnedIn(dialog: Element): (string | null | undefined)[] {
  const list = dialog.querySelector("[aria-label^='Pinned ']");
  return [...(list?.querySelectorAll("li") ?? [])].map((li) => li.querySelector("span.font-mono")?.textContent);
}

// Printing is a stylesheet, so what a test can hold is the markup it keys off:
// which elements are chrome and which are the page. The rules themselves are in
// index.css and only a renderer could check them.
test("printing an entry keeps the entry and drops the navigation", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const hidden = (selector: string) =>
    document.querySelector(selector)?.closest("[data-print='hide']") !== null;
  // Ways to reach another page, and paper goes nowhere.
  expect(hidden("nav[aria-label='Sections']")).toBe(true);
  expect(hidden("aside")).toBe(true);
  expect(hidden("[aria-label='Search or run a command']")).toBe(true);

  // The breadcrumb stays: on paper it is the only thing saying which entry this
  // sheet came from. So does the entry.
  expect(hidden("nav[aria-label='Breadcrumb']")).toBe(false);
  expect(document.querySelector("article")?.closest("[data-print='hide']")).toBeNull();
});

// A board is a horizontal thing and paper is vertical, so it prints as what it
// says rather than what it looks like — but only the controls are marked; the
// stacking is CSS.
test("printing a board drops its controls and keeps its columns", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const settings = [...document.querySelectorAll("main header button")].find(
    (b) => b.textContent === "Settings",
  )!;
  // Hidden with the rest of the board's controls, as one group.
  expect(settings.closest("[data-print='hide']")).not.toBeNull();
  // The columns are the content, and the scroller is what the print rules stack.
  const scroller = document.querySelector("[data-scroller]")!;
  expect(scroller.getAttribute("data-print")).toBeNull();
  expect(scroller.querySelectorAll("section[aria-label]").length).toBeGreaterThan(0);
});

// What you are looking at is what prints: a card open makes the board behind it
// context you are not reading.
test("printing a card open over a board drops the board", async () => {
  await mountAt("/kanban/notes/notes/a.md");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(document.querySelector("[data-scroller]")?.getAttribute("data-print")).toBe("hide");
  // The sheet becomes the page rather than staying a fixed box over a backdrop.
  const sheet = document.querySelector("[data-print='sheet']");
  expect(Boolean(sheet)).toBe(true);
  expect(sheet!.querySelector("[role='dialog']")?.textContent).toContain("The body of the entry.");
  // Its own controls go with the rest of the chrome.
  expect(sheet!.querySelector("[aria-label='Close card']")?.closest("[data-print='hide']")).not.toBeNull();
});

// The affordance has nothing dependable to attach to: an entry with no metadata
// has no frontmatter strip, and one whose body names itself has no title
// element. Floated, it attaches to neither.
test("an entry offers to print itself, whatever it is made of", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const button = document.querySelector<HTMLElement>("article [aria-label='Print this entry']")!;
  expect(Boolean(button)).toBe(true);
  // A control, so it does not print itself.
  expect(button.getAttribute("data-print")).toBe("hide");

  let printed = 0;
  const real = window.print;
  window.print = () => void printed++;
  try {
    await act(async () => button.click());
  } finally {
    window.print = real;
  }
  expect(printed).toBe(1);

  // `differs.md` opens with a heading of its own, so no title is prepended, and
  // its frontmatter is only a title — so it has no strip either. Both of the
  // things the button might have been attached to are gone.
  await act(async () => navigateTo("/wiki/notes/differs.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // Its own heading is there; the entry's title is not prepended above it.
  const headings = [...document.querySelectorAll("article h1")].map((h) => h.textContent ?? "");
  expect(headings.some((h) => h.includes("Steps"))).toBe(true);
  expect(headings.some((h) => h.includes("Deployment runbook"))).toBe(false);
  expect(Boolean(document.querySelector("article dl"))).toBe(false);
  expect(Boolean(document.querySelector("article [aria-label='Print this entry']"))).toBe(true);
});

// The entry's controls sit in a row above the title rather than floating over
// the content, so nothing can slide under them and they never cover anything.
test("the entry's controls are a toolbar row, not floats", async () => {
  await mountAt("/wiki/notes/a.md");
  const print = document.querySelector("article [aria-label='Print this entry']")!;
  const toolbar = print.closest("article > div")!;
  expect(toolbar.querySelector("[aria-label='Save to read later']")).not.toBeNull();
  expect(toolbar.querySelector("[aria-label^='Page width']")).not.toBeNull();
  // The toolbar comes first, before the title.
  expect(document.querySelector("article")!.firstElementChild).toBe(toolbar);
  expect(document.querySelector("article")!.innerHTML).not.toContain("float-");
});

// A lane header is set in capitals by the one shared rule rather than a
// sprinkling of `uppercase tracking-wide`. A column header is sentence-cased,
// as in the reference — by CSS, so its text is still the value.
test("capitals are set by one shared rule", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const caps = (el: Element | null | undefined) => el?.className.split(/\s+/).includes("caps");
  expect(caps(columnEl("todo").querySelector("h2"))).toBe(false);
  expect(columnEl("todo").querySelector("h2")?.className).toContain("first-letter:uppercase");
  expect(caps(columnEl("todo").querySelector("h3"))).toBe(true);

  // Uppercasing is presentation: the text itself is still the value, which is
  // what the section is labelled with and what gets written to wiki.toml.
  expect(columnEl("in-progress").querySelector("h2")?.textContent).toBe("in progress");
});

// Tags are what a card is about, and nearly every bundle has them. Shown without
// a setting: a bundle that carries none shows none, which costs it nothing.
test("a card shows its tags, and counts the ones it cannot fit", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const card = cardIn("todo", "A")!;
  const text = card.textContent ?? "";
  expect(text).toContain("ui");
  expect(text).toContain("api");
  expect(text).toContain("reader");
  // A card is a glance, not a tag cloud, so the rest are counted rather than
  // dropped — the card never understates what it carries.
  expect(text).not.toContain("boards");
  expect(text).toContain("+1");

  // A card with none says nothing about them.
  expect(cardIn("blocked", "B")!.textContent).not.toContain("+");
});

/** Serves a git status, and records what the actions ask for. */
/** Opens the source-control popover on one of its tabs, the way a person does:
 *  the pill, then the tab. Returns the popover. */
async function openGit(tab: "Incoming" | "Changes"): Promise<HTMLElement> {
  if (!document.querySelector("[role='dialog'][aria-label='Source control']")) {
    await act(async () => document.querySelector<HTMLElement>("[aria-label='Source control']")!.click());
  }
  const tabs = [...document.querySelectorAll<HTMLElement>("[role='tab']")];
  await act(async () => tabs.find((t) => t.textContent?.startsWith(tab))!.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  return document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
}

/** A repository level with its upstream and clean, which each test departs from. */
const gitDefaults: GitStatus = {
  repo: true,
  branch: "main",
  remote: "origin/main",
  ahead: 0,
  behind: 0,
  changes: [],
  outside: 0,
  incoming: [],
};

function stubGit(status: Partial<GitStatus>, onAction?: (path: string, body: unknown) => Response) {
  const real = globalThis.fetch;
  const full: GitStatus = { ...gitDefaults, ...status };
  const seen: { path: string; body: unknown }[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/git") || url === "/api/refresh") {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (init?.method === "POST") {
        seen.push({ path: url, body });
        if (onAction) return Promise.resolve(onAction(url, body));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ status: full }), {
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return real(input, init);
  }) as typeof fetch;
  return seen;
}

// A bundle is a folder first, and most folders are not repositories. The actions
// that need one are absent rather than broken.
test("the git actions are absent when the bundle is not a repository", async () => {
  await mountAt("/wiki/index.md");
  stubGit({ repo: false, remote: "" });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(Boolean(document.querySelector("[aria-label='Source control']"))).toBe(false);
  // Refresh re-reads the disk and has nothing to do with git, so it stays.
  expect(Boolean(document.querySelector("[aria-label='Refresh the index']"))).toBe(true);
});

// Refresh reaches nothing and undoes nothing, so it acts on the click. The rule
// it would otherwise obey exists for the two that can strand somebody.
test("refresh acts without a preview", async () => {
  await mountAt("/wiki/index.md");
  const asked = stubGit({});
  await act(async () => document.querySelector<HTMLElement>("[aria-label='Refresh the index']")!.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(asked.map((a) => a.path)).toEqual(["/api/refresh"]);
  expect(Boolean(document.querySelector("[role='dialog']"))).toBe(false);
});

// A sync previews everything it would commit, including work somebody else did:
// an agent editing alongside is the expected case, and hiding its files would
// misdescribe the button.
test("sync previews every file it would commit, then acts on confirmation", async () => {
  await mountAt("/wiki/index.md");
  const asked = stubGit({
    ahead: 1,
    changes: [
      { path: "notes/mine.md", code: " M" },
      { path: "notes/by-an-agent.md", code: "??" },
    ],
  });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Changes");
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
  expect(dialog.textContent).toContain("notes/mine.md");
  expect(dialog.textContent).toContain("notes/by-an-agent.md");
  expect(dialog.textContent).toContain("2 files to commit, 1 commit to push");
  // Nothing has happened yet.
  expect(asked.length).toBe(0);

  const confirm = [...dialog.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Commit & push"),
  )!;
  await act(async () => confirm.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // The message names what changed rather than asking for one or stamping a date
  // that git already records.
  expect(asked).toEqual([
    { path: "/api/git/sync", body: { message: "Update 2 entries in notes" } },
  ]);
});

// The rule the task turns on, from the outside: a refused pull says what
// happened and offers the way out in the same breath.
test("a refused pull offers to push the work to a branch", async () => {
  await mountAt("/wiki/index.md");
  const asked = stubGit({ behind: 2, ahead: 1 }, (path) => {
    if (path !== "/api/git/pull") {
      return new Response(
        JSON.stringify({
          status: { repo: true, branch: "main", remote: "origin/main", ahead: 1, behind: 2, changes: [], incoming: [] },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        status: { repo: true, branch: "main", remote: "origin/main", ahead: 1, behind: 2, changes: [], incoming: [] },
        error: "the pull was undone and nothing changed: CONFLICT in notes/a.md",
        proposed: "wikiview/2026-08-12-1430",
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Incoming");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
  // Opening the preview is what asks the remote; nothing fetches on its own.
  expect(asked.some((a) => a.path === "/api/git/fetch")).toBe(true);

  const pull = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Pull & rebase")!;
  await act(async () => pull.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(dialog.textContent).toContain("was undone and nothing changed");
  const branch = dialog.querySelector<HTMLInputElement>("[aria-label='Branch name']")!;
  expect(branch.value).toBe("wikiview/2026-08-12-1430");

  const push = [...dialog.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Push to this branch"),
  )!;
  await act(async () => push.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(asked.some((a) => a.path === "/api/git/branch")).toBe(true);
});

// A message you did not have to write, that still says something. The date is
// deliberately not in it: git records when, and repeating that in the subject
// line duplicates metadata git owns while saying nothing about the change.
test("the commit message is proposed from what changed", async () => {
  expect(proposeMessage([])).toBe("Update notes");
  expect(proposeMessage([{ path: "notes/design.md" }])).toBe("Update notes/design.md");
  expect(proposeMessage([{ path: "notes/a.md" }, { path: "notes/b.md" }])).toBe(
    "Update 2 entries in notes",
  );
  // Nothing shared, so nothing claimed about where.
  expect(proposeMessage([{ path: "a/x.md" }, { path: "b/y.md" }])).toBe("Update 2 entries");
});

// A bundle whose commits were made in a terminal has nothing to commit and
// something to push. Asking for a message would be a box to dismiss on the way.
test("a sync with nothing to commit is a push, and asks nothing", async () => {
  await mountAt("/wiki/index.md");
  const asked = stubGit({ ahead: 2, changes: [] });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Changes");
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
  expect(Boolean(dialog.querySelector("[aria-label='Commit message']"))).toBe(false);

  const confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Push")!;
  await act(async () => confirm.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(asked).toEqual([{ path: "/api/git/sync", body: { message: "Update notes" } }]);
});

// Nothing to do is not a button. Offering one whose only outcome is telling you
// it did nothing wastes the click and the reading.
test("an action with nothing to do cannot be confirmed", async () => {
  await mountAt("/wiki/index.md");
  stubGit({ ahead: 0, behind: 0, changes: [] });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Changes");
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
  const confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Push")!;
  expect(confirm.hasAttribute("disabled")).toBe(true);
  expect(dialog.textContent).toContain("Nothing to sync");
});

// A dialog whose work is finished has nothing left to say, so it says it and
// goes — rather than waiting to be dismissed by somebody who has already moved
// on.
test("a finished action closes itself, and a toast says what it did", async () => {
  await mountAt("/wiki/index.md");
  stubGit({ ahead: 1, changes: [] });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Changes");
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
  await act(async () =>
    [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Push")!.click(),
  );
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // Gone at once, rather than lingering to say "Done" — the toast says it.
  expect(Boolean(document.querySelector("[role='dialog'][aria-label='Source control']"))).toBe(false);
  expect(document.querySelector("[role='status']")?.textContent).toBe("Pushed 1 commit");
});

// The one success worth staying open for: the branch name is the whole point of
// a rescue, and dismissing would take away the only place it is written down.
test("a rescue stays on screen, because the branch name is the point", async () => {
  await mountAt("/wiki/index.md");
  stubGit({ behind: 1, ahead: 1 }, (path) => {
    if (path === "/api/git/pull") {
      return new Response(
        JSON.stringify({
          status: { repo: true, branch: "main", remote: "origin/main", ahead: 1, behind: 1, changes: [], incoming: [] },
          error: "the pull was undone and nothing changed",
          proposed: "wikiview/2026-08-12-1430",
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        status: { repo: true, branch: "main", remote: "origin/main", ahead: 1, behind: 1, changes: [], incoming: [] },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Incoming");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
  await act(async () =>
    [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Pull & rebase")!.click(),
  );
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () =>
    [...dialog.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Push to this branch"))!
      .click(),
  );
  await act(async () => new Promise((r) => setTimeout(r, 1400)));

  const still = document.querySelector("[role='dialog'][aria-label='Source control']");
  expect(Boolean(still)).toBe(true);
  expect(still?.textContent).toContain("wikiview/2026-08-12-1430");
});

// Staged work outside the bundle is not going to be committed, which is exactly
// why it gets said: staging files in a terminal and then pressing a button
// called "commit and push" looks like it covers both.
test("staged work outside the bundle is named as work this will not touch", async () => {
  await mountAt("/wiki/index.md");
  stubGit({ changes: [{ path: "bundle/b.md", code: "??" }], outside: 2 });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Changes");
  const text = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!.textContent!;
  expect(text).toContain("2 staged files elsewhere in this repository");
  expect(text).toContain("will not be committed");
});

// A repository with nothing staged outside it has nothing to say, and a dialog
// that reassures you about every absent problem is a dialog nobody reads.
test("a bundle that is the whole repository says nothing about elsewhere", async () => {
  await mountAt("/wiki/index.md");
  stubGit({ changes: [{ path: "b.md", code: "??" }], outside: 0 });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Changes");
  const text = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!.textContent!;
  expect(text).not.toContain("elsewhere in this repository");
});

// The button names what it is doing. "Working…" covers a pull, a push and the
// fetch that opens a preview, which are three different things to be waiting on.
test("a busy button names the action it is busy with", async () => {
  await mountAt("/wiki/index.md");
  let release: (r: Response) => void = () => {};
  stubGit({ ahead: 1, changes: [] }, () => {
    // Never resolves until the test lets it, so the busy state can be read.
    return new Promise<Response>((r) => (release = r)) as unknown as Response;
  });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Changes");
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
  await act(async () =>
    [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Push")!.click(),
  );
  expect(dialog.textContent).toContain("Pushing…");
  expect(dialog.textContent).not.toContain("Working…");
  await act(async () => {
    release(
      new Response(JSON.stringify({ status: { repo: true, branch: "main", remote: "origin/main", ahead: 0, behind: 0, changes: [], outside: 0 } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
  });
});

// The read that opens a pull preview is not a pull, and a button reading
// "Pulling…" while it fetches names the wrong thing — and invites a click on an
// action that has not been previewed yet.
test("the fetch that opens a pull preview is not called pulling", async () => {
  await mountAt("/wiki/index.md");
  let release: (r: Response) => void = () => {};
  stubGit({ behind: 3 }, (path) => {
    if (path === "/api/git/fetch") return new Promise<Response>((r) => (release = r)) as unknown as Response;
    return new Response("{}", { headers: { "content-type": "application/json" } });
  });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Incoming");
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
  expect(dialog.textContent).toContain("Asking the remote what it has");
  expect(dialog.textContent).not.toContain("Pulling…");
  const confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Pull & rebase")!;
  expect(confirm.hasAttribute("disabled")).toBe(true);

  await act(async () => {
    release(
      new Response(JSON.stringify({ status: { repo: true, branch: "main", remote: "origin/main", ahead: 0, behind: 3, changes: [], outside: 0, incoming: [] } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(confirm.hasAttribute("disabled")).toBe(false);
});

// Two conditions, not one. The sentence is about a commit, so a push has
// nothing to leave out — and a warning that keeps appearing over a dialog with
// nothing to commit stops being read.
test("work outside the bundle is only mentioned when a commit is happening", async () => {
  await mountAt("/wiki/index.md");
  stubGit({ ahead: 1, changes: [], outside: 3 });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await openGit("Changes");
  const text = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!.textContent!;
  expect(text).not.toContain("elsewhere in this repository");
});

// Seven columns at 48rem is seven strips of wrapping text. The wrapper takes
// the scrollbar so the table stays a table (see `.markdown-table` in index.css).
test("a wide table sits in a scrolling wrapper and the table stays a table", async () => {
  await mountAt("/wiki/notes/wide.md");

  const scroller = document.querySelector<HTMLElement>(".markdown-table");
  const table = scroller?.querySelector("table");
  expect(table?.parentElement).toBe(scroller);
  expect(table?.querySelectorAll("thead th").length).toBe(7);
  expect(table?.querySelectorAll("tbody tr").length).toBe(2);
  // Prose around the table is undisturbed.
  expect(document.querySelector(".markdown p")?.textContent).toContain("counted by quarter");
});

// The reading column is a class rather than a literal width in the markup, so
// the width becomes a preference in one place instead of four.
test("reading pages sit in the .reading-column class", async () => {
  await mountAt("/wiki/notes/wide.md");
  expect(document.querySelector("article")?.className).toContain("reading-column");
});

test("wide is one click, applies to the page, and is remembered", async () => {
  await mountAt("/wiki/notes/a.md");
  const toggle = () => document.querySelector<HTMLElement>("[aria-label^='Page width']")!;

  expect(toggle().getAttribute("aria-pressed")).toBe("false");
  expect(document.documentElement.hasAttribute("data-width")).toBe(false);

  await act(async () => toggle().click());
  expect(document.documentElement.getAttribute("data-width")).toBe("wide");
  expect(toggle().getAttribute("aria-pressed")).toBe("true");
  // Same key `index.html` reads before the first paint, so a reload opens wide.
  expect(localStorage.getItem("wiki:width")).toBe("wide");

  await mountAt("/wiki/notes/a.md");
  expect(toggle().getAttribute("aria-pressed")).toBe("true");

  // Reading width is the absence of a stamp, not a value of its own.
  await act(async () => toggle().click());
  expect(document.documentElement.hasAttribute("data-width")).toBe(false);
  expect(localStorage.getItem("wiki:width")).toBeNull();
});

// ── Graphs ────────────────────────────────────────────────────────────────

const graphNodes = () =>
  [...document.querySelectorAll("main svg [data-path]")].map((g) => ({
    path: g.getAttribute("data-path"),
    name: g.getAttribute("aria-label"),
    neighbour: g.hasAttribute("data-neighbour"),
  }));

async function openGraph(path = "/graph/notes") {
  await mountAt("/wiki/index.md");
  await act(async () => navigateTo(path));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

// Every node the server sent is drawn, the isolated one included: a node that
// links nothing is the answer to "who is not connected", and leaving it off is
// how a graph lies.
test("a graph URL draws every node, isolated and neighbour ones included", async () => {
  await openGraph();

  expect(graphNodes()).toEqual([
    { path: "/index.md", name: "Index", neighbour: true },
    // Its title, which is what it calls itself.
    { path: "/notes/a.md", name: "A Note", neighbour: false },
    { path: "/notes/b.md", name: "B", neighbour: false },
    { path: "/notes/d.md", name: "D", neighbour: false },
  ]);
  const header = document.querySelector("main header")!.textContent;
  expect(header).toContain("Who links whom");
  expect(header).toContain("type=note");
  expect(header).toContain("4 entries · 2 links");
  // Two edges, each drawn once: a mutual pair is one line, not two stacked.
  expect(document.querySelectorAll("main svg line[class]").length).toBe(2);
});

// An edge says what it is when pointed at: which way, how it was written, and
// how many links it stands for.
test("an edge describes itself", async () => {
  await openGraph();
  const titles = [...document.querySelectorAll("main svg line title")].map((t) => t.textContent);
  expect(titles).toContain("A Note ↔ B\nblockers, body · 3 links");
  expect(titles).toContain("A Note → Index\nbody");
});

// A node opens as the card sheet a board uses, and the address carries it, so
// back closes it and a link reopens the same thing.
test("clicking a node opens its entry over the graph", async () => {
  await openGraph();
  const a = document.querySelector("main svg [data-path='/notes/a.md']") as SVGElement;
  await act(async () => a.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(here).toBe("/graph/notes/notes/a.md");
  const sheet = document.querySelector("[role='dialog']")!;
  expect(sheet.textContent).toContain("The body of the entry.");
  // The graph is still behind it.
  expect(graphNodes().length).toBe(4);

  // A link to another node opens that node over the graph; one to an entry the
  // graph does not hold leaves for the reader.
  const hrefs = [...sheet.querySelectorAll(".markdown a")].map((l) => l.getAttribute("href"));
  expect(hrefs).toContain("/graph/notes/notes/b.md");
  expect(hrefs).toContain("/graph/notes/index.md"); // a neighbour is on the graph too
  expect(hrefs).toContain("/wiki/notes/gone.md");
});

// As on a board, a click on the view itself is done with the entry. On a graph
// pressing is also how you pan, so only a press that did not move counts.
test("a click on the empty canvas closes the entry, a pan does not", async () => {
  await openGraph();
  const canvas = document.querySelector("main svg[role='img']")!;
  const node = () => document.querySelector("main svg [data-path='/notes/a.md']")!;
  const at = (el: Element, type: string, x: number) =>
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerType: "mouse", clientX: x, clientY: 10 }));
  const open = async () => {
    await act(async () => node().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(here).toBe("/graph/notes/notes/a.md");
  };

  // A pan, then a jitter under the 4px a pan needs: the first keeps it open.
  await open();
  await act(async () => void (at(canvas, "pointerdown", 10), at(canvas, "pointermove", 40), at(canvas, "pointerup", 40)));
  expect(here).toBe("/graph/notes/notes/a.md");
  await act(async () => void (at(canvas, "pointerdown", 10), at(canvas, "pointermove", 12), at(canvas, "pointerup", 12)));
  expect(here).toBe("/graph/notes");

  // A press on a node is the node's, not the canvas's.
  await open();
  await act(async () => void (at(node(), "pointerdown", 10), at(node(), "pointerup", 10)));
  expect(here).toBe("/graph/notes/notes/a.md");
});

test("a node opens from the keyboard", async () => {
  await openGraph();
  const b = document.querySelector("main svg [data-path='/notes/b.md']") as SVGElement;
  await act(async () => b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(here).toBe("/graph/notes/notes/b.md");
});

// The id is the graph's, not the board's: the same word under /kanban is a
// different view, and asking the graph endpoint for it is what proves which.
test("a graph and a board may share an id", async () => {
  await openGraph();
  expect(document.querySelector("main svg[role='img']")).not.toBeNull();
  expect(document.querySelector("main section[aria-label]")).toBeNull(); // no columns
});

test("a graph nobody declared is not found", async () => {
  await openGraph("/graph/nobody");
  expect(document.querySelector("main")!.textContent).toContain("There is no graph with that id");
});

// Direction is shown where it is asked about: on the edges of the node you are
// pointing at, and nowhere else — there is no toggle to keep on.
test("arrowheads appear on the pointed-at node's edges only", async () => {
  await openGraph();
  const ends = () => document.querySelectorAll("main svg line[marker-end]").length;
  const starts = () => document.querySelectorAll("main svg line[marker-start]").length;
  expect(ends()).toBe(0);
  expect([...document.querySelectorAll("main header label")].some((l) => l.textContent?.includes("Direction"))).toBe(false);

  await pointAt("/notes/a.md");
  // Both of A's edges, and the one that goes both ways points both ways.
  expect(ends()).toBe(2);
  expect(starts()).toBe(1);

  const a = document.querySelector("main svg [data-path='/notes/a.md']")!;
  await act(async () => a.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
  await act(async () => a.dispatchEvent(new PointerEvent("pointerleave")));
  expect(ends()).toBe(0);
});

// Hovering a node lights its edges and its neighbours and fades the rest.
test("pointing at a node lights what it touches", async () => {
  await openGraph();
  const d = document.querySelector("main svg [data-path='/notes/d.md']") as SVGElement;
  const a = document.querySelector("main svg [data-path='/notes/a.md']") as SVGElement;
  await act(async () => a.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await act(async () => a.dispatchEvent(new PointerEvent("pointerenter")));
  expect(a.getAttribute("opacity")).toBe("1");
  expect(Number(d.getAttribute("opacity"))).toBeLessThan(0.5);
  expect(document.querySelectorAll("main svg line[class~='stroke-fg/60']").length).toBe(2);
});

async function mountWithGraphs(graphs: BundleInfo["graphs"], served?: Graph) {
  await mountAt("/wiki/index.md");
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (v: unknown) =>
      Promise.resolve(new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } }));
    if (url.endsWith("/api/bundle")) return json({ ...bundle, graphs });
    if (served && url.includes("/api/graph/")) return json(served);
    return real(input, init);
  }) as typeof fetch;
  // An unseen version refetches the bundle, which is how the stub takes effect.
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}


// With graphs declared the icon goes to one, the one you were last on.
test("the Graphs icon returns to the graph you were last on", async () => {
  await mountWithGraphs([
    { path: "/notes", id: "notes", name: "Who links whom", entries: 3 },
    { path: "/", id: "all", name: "Everything", entries: 9 },
  ]);
  await act(async () => openSection("Graphs"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(here).toBe("/graph/notes");
  expect(activeSection()).toBe("Graphs");

  // Two graphs are a choice, so the list is open beside the first.
  const links = [...document.querySelectorAll("aside a")];
  expect(links.map((l) => l.getAttribute("href"))).toEqual(["/graph/notes", "/graph/all"]);
  await act(async () => (links[1] as HTMLElement).click());
  await act(async () => navigateTo("/wiki/index.md"));
  await act(async () => openSection("Graphs"));
  expect(here).toBe("/graph/all");
});

// Filters exist so a graph is not thousands of nodes. Past the soft limit it
// says so — and still draws every one, since the node left off would be the one
// you were looking for.
test("a very large graph warns and still draws everything", async () => {
  const many: Graph = {
    ...graphFixture,
    nodes: Array.from({ length: 501 }, (_, i) => ({ path: `/notes/n${i}.md`, label: `N${i}` })),
    edges: [],
  };
  await mountWithGraphs(bundle.graphs, many);
  await act(async () => navigateTo("/graph/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(document.querySelector("main [role='status']")?.textContent).toContain("501 entries");
  expect(graphNodes().length).toBe(501);
});

test("a graph with nothing in it says why", async () => {
  await mountWithGraphs(bundle.graphs, { ...graphFixture, nodes: [], edges: [] });
  await act(async () => navigateTo("/graph/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(document.querySelector("main")!.textContent).toContain("No entry under /notes matches its filter");
});

test("the tab names the graph, or the entry open over it", async () => {
  await openGraph();
  expect(document.title).toBe("Who links whom · My kb");
  await act(async () => navigateTo("/graph/notes/notes/a.md"));
  expect(document.title).toBe("A Note · My kb");
});

// No graph is built in, so with none declared the Graphs icon has nowhere to go:
// the panel is where the first one is made, and it offers that rather than a
// note about what to write by hand.
test("with no graphs declared the panel is where one is made", async () => {
  await mountWithGraphs(undefined);
  await act(async () => openSection("Graphs"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(here).toBe("/wiki/index.md");
  const panel = document.querySelector("aside")!;
  expect(panel.textContent).toContain("Your first graph");
  expect(panel.textContent).not.toContain("Your first board");
  const dialog = await openNew(panel, "graph");
  // Addressed under its own prefix, with an id suggested from the name.
  expect(dialog.textContent).toContain("/graph/");
  expect(dialog.querySelector<HTMLInputElement>("input[aria-label='Graph id']")?.value).toBe("my-kb");
  // A graph assumes nothing, so it starts with no filter — and its words are
  // its own: a node, not a card.
  expect(chips(dialog)).toEqual([]);
  expect(dialog.textContent).toContain("every entry in the folder is a node");
  expect([...new Set(drafts)]).toEqual(["/api/draft/graph/"]);

  const writes = captureWrites();
  await act(async () => submit(dialog));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(writes).toEqual([{ url: "/api/graph", body: { id: "my-kb", path: "/", name: "My kb", where: [] } }]);
  expect(here).toBe("/graph/my-kb");
});

test("a refused graph keeps you on the form and says why", async () => {
  await mountWithGraphs(undefined);
  await act(async () => openSection("Graphs"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = await openNew(document.querySelector("aside")!, "graph");

  captureWrites(422);
  await act(async () => submit(dialog));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(dialog.textContent).toContain(refusal);
  expect(here).toBe("/wiki/index.md");
});

// With graphs declared, the list is what you came for and the form waits behind
// a button.
test("the graphs list can add another", async () => {
  await mountWithGraphs([
    { path: "/notes", id: "notes", name: "Who links whom", entries: 2 },
    { path: "/", id: "all", name: "Everything", entries: 2 },
  ]);
  await act(async () => navigateTo("/graph/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const panel = document.querySelector("aside")!;
  expect(Boolean(panel.querySelector("form"))).toBe(false);

  const dialog = await openNew(panel, "graph");
  expect(Boolean(dialog.querySelector("input[aria-label='Graph id']"))).toBe(true);

  // A form you opened is one you can put away, without writing anything.
  const writes = captureWrites();
  const cancel = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
  await act(async () => cancel.click());
  expect(document.querySelector("[aria-label='New graph']")).toBeNull();
  expect(writes).toEqual([]);
});

function openGraphSettings() {
  const button = [...document.querySelectorAll("main header button")].find(
    (b) => b.textContent === "Settings",
  ) as HTMLElement;
  button.click();
}

const graphDialog = () => document.querySelector<HTMLElement>("[aria-label='Graph settings']");

// Seeded from the graph, so saving without touching anything writes back what
// it already is.
test("graph settings open seeded from the graph and save it whole", async () => {
  await openGraph();
  await act(async () => openGraphSettings());
  const dialog = graphDialog()!;

  expect(dialog.querySelector<HTMLInputElement>("input:not([type])")?.value).toBe("Who links whom");
  expect(chips(dialog)).toEqual(["typeisnote"]);
  const neighbours = dialog.querySelector<HTMLInputElement>("input[type='checkbox']")!;
  expect(neighbours.checked).toBe(true);
  // A node, not a card: the words are the view's.
  expect(dialog.textContent).toContain("A node is an entry matching");

  // Turn neighbours off and drop the filter: sent whole, so both clearings say
  // so rather than being mistaken for "unchanged".
  await act(async () => neighbours.click());
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Remove filter 1']")!.click());
  const writes = captureWrites();
  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(writes).toEqual([
    { url: "/api/graph/notes", body: { name: "Who links whom", where: [], neighbours: false } },
  ]);
  expect(graphDialog()).toBeNull();
});

// The filter offers what the folder holds, before the graph's own filter: that
// is how `task` can be chosen though no node is one.
test("a graph's filter offers the folder's keys", async () => {
  await openGraph();
  await act(async () => openGraphSettings());
  const dialog = graphDialog()!;
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Edit filter 1']")!.click());
  const keys = [...dialog.querySelectorAll("[aria-label='Filter key'] option")].map((o) => o.textContent);
  expect(keys).toEqual(["status", "type"]);
  const values = [...dialog.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"));
  expect(values).toEqual(["note", "task"]);
});

test("a refused graph save keeps the form open and says why", async () => {
  await openGraph();
  await act(async () => openGraphSettings());
  captureWrites(422);
  const dialog = graphDialog()!;
  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(dialog.textContent).toContain(refusal);
  expect(graphDialog()).not.toBeNull();
});

test("graph settings close on Escape without writing", async () => {
  await openGraph();
  await act(async () => openGraphSettings());
  const writes = captureWrites();
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(graphDialog()).toBeNull();
  expect(writes).toEqual([]);
});

const labelOf = (path: string) =>
  document.querySelector(`main svg [data-path='${path}'] text`) as SVGTextElement | null;
const dotOf = (path: string) =>
  document.querySelector(`main svg [data-path='${path}'] circle`) as SVGCircleElement;
const positionOf = (path: string) => {
  const t = document.querySelector(`main svg [data-path='${path}']`)!.getAttribute("transform")!;
  const [x, y] = t.replace(/translate\(|\)/g, "").split(" ").map(Number);
  return { x: x!, y: y! };
};
const textSizeButton = (label: string) =>
  document.querySelector<HTMLButtonElement>(`main header [aria-label='${label} text']`)!;

// Zoom spreads nodes apart and never makes anything bigger, so zooming in to
// read makes room between titles rather than a bigger copy of the crowding.
test("zooming in moves nodes apart and leaves dots and labels their size", async () => {
  await openGraph();
  const gap = () => {
    const a = positionOf("/notes/a.md");
    const d = positionOf("/notes/d.md");
    return Math.hypot(a.x - d.x, a.y - d.y);
  };
  const before = { gap: gap(), r: dotOf("/notes/a.md").getAttribute("r"), font: labelOf("/notes/a.md")!.getAttribute("font-size") };

  const svg = document.querySelector("main svg[role='img']")!;
  await act(async () => svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -800, bubbles: true, cancelable: true })));

  expect(gap()).toBeGreaterThan(before.gap * 2);
  expect(dotOf("/notes/a.md").getAttribute("r")).toBe(before.r);
  expect(labelOf("/notes/a.md")!.getAttribute("font-size")).toBe(before.font);
});

// How big things are is its own control, live and remembered: the other half of
// zoom no longer enlarging anything.
test("text size is a live control, remembered, that the dots follow a little", async () => {
  await openGraph();
  expect(textSizeButton("Medium").getAttribute("aria-pressed")).toBe("true");
  const medium = { font: Number(labelOf("/notes/a.md")!.getAttribute("font-size")), r: Number(dotOf("/notes/a.md").getAttribute("r")) };

  await act(async () => textSizeButton("Large").click());
  const large = { font: Number(labelOf("/notes/a.md")!.getAttribute("font-size")), r: Number(dotOf("/notes/a.md").getAttribute("r")) };
  expect(large.font).toBeGreaterThan(medium.font);
  // The dot grows too, but less than the text: a large title should not hang
  // off a speck, and a large dot is what this was fixing.
  expect(large.r).toBeGreaterThan(medium.r);
  expect(large.r / medium.r).toBeLessThan(large.font / medium.font);

  await act(async () => textSizeButton("Small").click());
  expect(Number(labelOf("/notes/a.md")!.getAttribute("font-size"))).toBeLessThan(medium.font);

  await openGraph();
  expect(textSizeButton("Small").getAttribute("aria-pressed")).toBe("true");
});

// Something stored by another version of the control is not a size, and must
// not leave the graph drawn without one.
test("a stored text size that is not one falls back to medium", async () => {
  localStorage.setItem("wiki:abc123:graph-text", JSON.stringify("huge"));
  await openGraph();
  expect(textSizeButton("Medium").getAttribute("aria-pressed")).toBe("true");
  expect(labelOf("/notes/a.md")!.getAttribute("font-size")).not.toBeNull();
});

// Titles are sentences, so a long one is shortened — and shown whole on the
// node you are pointing at, which is when it is worth its width.
test("a long title is shortened until you point at it", async () => {
  const long = "A title that is really a whole sentence about the thing";
  await mountWithGraphs(bundle.graphs, {
    ...graphFixture,
    nodes: [{ path: "/notes/a.md", label: "A", title: long }],
    edges: [],
  });
  await act(async () => navigateTo("/graph/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const label = () => labelOf("/notes/a.md")!.textContent!;
  expect(label().endsWith("…")).toBe(true);
  expect(label().length).toBeLessThan(long.length);
  // The accessible name is never shortened.
  expect(document.querySelector("main svg [data-path='/notes/a.md']")!.getAttribute("aria-label")).toBe(long);

  const node = document.querySelector("main svg [data-path='/notes/a.md']")!;
  await act(async () => node.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await act(async () => node.dispatchEvent(new PointerEvent("pointerenter")));
  expect(label()).toBe(long);
});

// Opening the app is one more way in, and it used to be the one that did not
// ask: `/` went to /wiki/index.md whatever the bundle had, so a bundle without
// one opened on "there is no entry here yet". It goes where the logo goes.
test("opening the app lands on the front door, not an index.md that is not there", async () => {
  await mountAt("/");
  expect(here).toBe("/wiki/index.md");

  const had = tree.index;
  delete tree.index;
  try {
    await mountAt("/");
    expect(here).toBe("/wiki/");
  } finally {
    tree.index = had;
  }
});

// ─── The source-control pill ────────────────────────────────────────────────

/** Mounts with a repository in the given state, and waits for the pill. */
async function mountWithGit(status: Partial<GitStatus>, onAction?: (path: string, body: unknown) => Response) {
  await mountAt("/wiki/index.md");
  const asked = stubGit(status, onAction);
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const pill = document.querySelector<HTMLElement>("[aria-label='Source control']")!;
  return { asked, pill };
}

// The pill is the whole status at a glance, so each state has to be told apart
// without opening anything.
test("the pill says behind, ahead, changed — or synced when it is none of them", async () => {
  let { pill } = await mountWithGit({});
  expect(pill.textContent).toBe("mainsynced");

  ({ pill } = await mountWithGit({
    behind: 7,
    ahead: 2,
    changes: [{ path: "notes/a.md", code: " M" }],
  }));
  expect(pill.textContent).toContain("↓7");
  expect(pill.textContent).toContain("↑2");
  expect(pill.textContent).toContain("1");
  expect(pill.textContent).not.toContain("synced");
});

// Commits rather than a count: what is coming, who wrote it and how long ago, and
// an honest "more" when the server's list stops short of the count.
test("incoming lists the commits a pull would take", async () => {
  const commit = (n: number) => ({
    sha: "abc123" + n,
    subject: "Add scenario " + n,
    author: "ana",
    when: new Date(Date.now() - 3 * 3600_000).toISOString(),
  });
  const behind = { behind: 5, incoming: [commit(1), commit(2)] };
  const { pill } = await mountWithGit(behind, () =>
    new Response(JSON.stringify({ status: { ...gitDefaults, ...behind } }), {
      headers: { "content-type": "application/json" },
    }),
  );
  await act(async () => pill.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const popover = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Source control']")!;
  const rows = [...popover.querySelectorAll("li")].map((li) => li.textContent);
  expect(rows[0]).toBe("abc1231Add scenario 1ana · 3 h ago");
  expect(rows).toContain("and 3 more");
  expect(popover.textContent).toContain("5 commits to take");
});

// Only Incoming reads the network, and the popover opens where your own work is,
// so opening it to push reaches nothing. Switching to Incoming asks once.
test("the popover opens on your changes and fetches only for Incoming, once", async () => {
  const { asked, pill } = await mountWithGit({ changes: [{ path: "notes/a.md", code: "??" }] });
  await act(async () => pill.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const selected = () => document.querySelector("[role='tab'][aria-selected='true']")?.textContent;
  expect(selected()).toStartWith("Changes");
  expect(asked.filter((a) => a.path === "/api/git/fetch").length).toBe(0);

  await openGit("Incoming");
  await openGit("Changes");
  await openGit("Incoming");
  expect(asked.filter((a) => a.path === "/api/git/fetch").length).toBe(1);
});

// A popover that only closes by finding its button is one people leave open.
test("the popover closes on Escape, on a press outside, and not on one inside", async () => {
  const { pill } = await mountWithGit({});
  const open = () => Boolean(document.querySelector("[role='dialog'][aria-label='Source control']"));

  await act(async () => pill.click());
  expect(open()).toBe(true);
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(open()).toBe(false);

  await act(async () => pill.click());
  const inside = document.querySelector("[role='dialog'][aria-label='Source control'] [role='tab']")!;
  await act(async () => inside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  expect(open()).toBe(true);
  await act(async () => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  expect(open()).toBe(false);

  // And the pill toggles it, rather than a press on it counting as outside.
  await act(async () => pill.click());
  await act(async () => pill.click());
  expect(open()).toBe(false);
});

// ─── The rail and the tree, redrawn ─────────────────────────────────────────

const railButton = (label: string) =>
  document.querySelector<HTMLElement>(`nav[aria-label='Sections'] button[title='${label}']`)!;
const folderRow = (label: string) =>
  [...document.querySelectorAll<HTMLElement>("aside li > div")].find(
    (row) => row.querySelector("a")?.textContent === label,
  )!;

// A folder is a place to go and a list to open, so its row has one control for
// each. The chevron only opens and closes; the name goes to the folder.
test("a folder's chevron toggles it where it stands, and its name opens it", async () => {
  await mountAt("/wiki/index.md");
  const chevron = () => folderRow("Notes").querySelector<HTMLButtonElement>("button")!;
  const inTree = () => [...document.querySelectorAll("aside a")].map((a) => a.textContent);

  expect(chevron().getAttribute("aria-expanded")).toBe("false");
  await act(async () => chevron().click());
  expect(chevron().getAttribute("aria-expanded")).toBe("true");
  expect(inTree()).toContain("A");
  expect(here).toBe("/wiki/index.md"); // nowhere: the chevron is not a link
  await act(async () => chevron().click());
  expect(inTree()).not.toContain("A");

  // The name navigates — to the listing here, since /notes has no index.md —
  // and opens the folder on the way, which is where you are now.
  await act(async () => folderRow("Notes").querySelector("a")!.click());
  expect(here).toBe("/wiki/notes/");
  expect(chevron().getAttribute("aria-expanded")).toBe("true");
  // And the row says you are on it.
  expect(folderRow("Notes").className).toContain("bg-accent-bg");
});

// The name toggles as the chevron does, so closing a folder does not mean going
// back for the small target: click it open, click it shut. It still goes to the
// folder, and being on the folder does not reopen it — only an entry inside
// does, for the folders above it.
test("a folder's name opens and closes it", async () => {
  await mountAt("/wiki/notes/a.md"); // opened for the entry you are on
  const chevron = () => folderRow("Notes").querySelector<HTMLButtonElement>("button")!;
  const name = () => folderRow("Notes").querySelector("a")!;
  expect(chevron().getAttribute("aria-expanded")).toBe("true");

  await act(async () => name().click());
  expect(here).toBe("/wiki/notes/");
  expect(chevron().getAttribute("aria-expanded")).toBe("false");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(chevron().getAttribute("aria-expanded")).toBe("false"); // and stays shut

  await act(async () => name().click());
  expect(chevron().getAttribute("aria-expanded")).toBe("true");
  await act(async () => name().click());
  expect(chevron().getAttribute("aria-expanded")).toBe("false");
});

// A modified click opens the folder in another tab or window, and the tree in
// this one is not what it was asking to change.
test("a modified click on a folder's name leaves it as it was", async () => {
  await mountAt("/wiki/index.md");
  const chevron = () => folderRow("Notes").querySelector<HTMLButtonElement>("button")!;
  const name = folderRow("Notes").querySelector("a")!;
  for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
    await act(async () => name.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init })));
    expect(chevron().getAttribute("aria-expanded")).toBe("false");
  }
});

// Top-level folders wear their group's colour, and deeper ones none: a group is
// one level (backlog/8-design/003). The count is the folder's own children.
test("top-level folders carry their group colour and a count", async () => {
  await mountAt("/wiki/index.md");
  const dot = folderRow("Notes").querySelector<HTMLElement>("a > span[aria-hidden]");
  expect(dot?.style.background).toBe("var(--color-cat-0)");
  expect(folderRow("Empty").querySelector<HTMLElement>("a > span[aria-hidden]")?.style.background).toBe(
    "var(--color-cat-1)",
  );
  expect(folderRow("Notes").lastElementChild?.textContent).toBe("3");
  expect(folderRow("Empty").lastElementChild?.textContent).toBe("0");
});

// The keyboard's way to the same toggle as the active rail icon.
test("⌘\\ toggles the panel of the section you are in", async () => {
  await mountAt("/wiki/index.md");
  const panel = document.querySelector("aside")!;
  const press = (init: KeyboardEventInit) =>
    act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", ...init })));
  expect(panel.getAttribute("data-open")).toBe("true");
  await press({ metaKey: true });
  expect(panel.getAttribute("data-open")).toBe("false");
  await press({ ctrlKey: true });
  expect(panel.getAttribute("data-open")).toBe("true");
  // A bare backslash is typing, not a shortcut.
  await press({});
  expect(panel.getAttribute("data-open")).toBe("true");
});

// A list you go to says how much is waiting in it, and says nothing when
// nothing is.
test("the rail counts what you saved to read later, and hides a zero", async () => {
  await mountAt("/wiki/notes/a.md");
  expect(railButton("Read later").getAttribute("aria-label")).toBe("Read later");
  expect(railButton("Read later").textContent).toBe("");

  const save = document.querySelector<HTMLElement>("[aria-label='Save to read later']")!;
  await act(async () => save.click());
  expect(railButton("Read later").getAttribute("aria-label")).toBe("Read later, 1");
  expect(railButton("Read later").textContent).toBe("1");
});

// Each view in a list says what it covers and how much is in it, so two views
// over one folder, or a board with nothing on it, can be told apart unopened.
test("the boards and graphs lists say how big each view is", async () => {
  await mountWithGraphs([
    { path: "/notes", id: "notes", name: "Who links whom", entries: 3 },
    { path: "/", id: "all", name: "Everything", entries: 1 },
  ]);
  await act(async () => navigateTo("/graph/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const rows = [...document.querySelectorAll("aside li a")].map((a) => a.textContent);
  expect(rows).toEqual(["WWho links whom/notes · 3 entries", "EEverything/ · 1 entry"]);
});

// ─── The entry page, redrawn ────────────────────────────────────────────────

// "Links out" counts entries, once each: a body link to a real entry and a
// frontmatter reference both count, while a file, an unwritten entry and a link
// out of the bundle are not entries this one links to.
test("the meta line counts distinct entries linked, and says when it changed", async () => {
  await mountAt("/wiki/notes/a.md");
  const meta = document.querySelector("article > h1 + div")!;
  // b.md (body and blockers, once), index.md. Not README, contract, diagram, gone.
  expect(meta.textContent).toContain("2 links out");
  expect(meta.textContent).toContain("2 backlinks");
  const out = [...document.querySelectorAll("article section > div:first-child a")];
  expect(out.map((a) => a.getAttribute("href"))).toEqual(["/wiki/notes/b.md", "/wiki/index.md"]);

  await act(async () => navigateTo("/wiki/notes/sections.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(document.querySelector("article > h1 + div")!.textContent).toBe(
    "Updated 3 h ago0 links out0 backlinks",
  );
  // An entry with nothing either way still draws both columns, so the footer
  // does not reflow between entries.
  expect(document.querySelector("article section")!.textContent).toBe(
    "Links to · 0Nothing yetLinked from · 0Nothing yet",
  );
});

// Tags wear their colour; other lists are chips so their items read as items;
// references stay links. Nothing is coloured by what it says.
test("the property grid draws tags, lists and references each as what they are", async () => {
  openProperties();
  await mountAt("/wiki/notes/sections.md");
  const dd = (key: string) =>
    [...document.querySelectorAll("article dl dt")].find((dt) => dt.textContent === key)!
      .nextElementSibling!;
  const tagDots = [...dd("tags").querySelectorAll("span[aria-hidden]")] as HTMLElement[];
  // The fixture bundle's tag list is empty, so these are ahead of it: neutral.
  expect(tagDots.map((d) => d.style.background)).toEqual(["var(--color-faint)", "var(--color-faint)"]);
  expect(dd("owners").textContent).toBe("anajordi");
  expect(dd("owners").querySelectorAll("span[aria-hidden]")).toHaveLength(0); // no dot on a plain list

  await act(async () => navigateTo("/wiki/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(dd("blockers").querySelector("a")?.getAttribute("href")).toBe("/wiki/notes/b.md");
});

/** Sets the window's width for the media queries that read it. */
async function viewport(width: number) {
  // Inside act: the media query answers synchronously, and the state it sets
  // has to land before the next assertion rather than whenever React gets to it.
  await act(async () => {
    (window as unknown as { happyDOM: { setViewport(v: { width: number; height: number }): void } }).happyDOM.setViewport(
      { width, height: 900 },
    );
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Says how much room the reader has: its area's content box, which is the
 *  window less the panels beside it, and is what the reader lays out by. */
async function readerRoom(width: number) {
  await act(async () => resize(document.querySelector("main article")!.parentElement!, width));
}

const map = () => document.querySelector<HTMLElement>("nav[aria-label='On this page']");
/** The map's lines, and its floating titles once it is open. */
const mapLines = () => [...map()!.querySelectorAll<HTMLElement>(":scope > div[aria-hidden] > a")];
const mapTitles = () => [...map()!.querySelectorAll<HTMLElement>(":scope > div:not([aria-hidden]) a")];
async function restOnMap() {
  await act(async () => mapLines()[0]!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await act(async () => map()!.dispatchEvent(new PointerEvent("pointerenter")));
  await act(async () => new Promise((r) => setTimeout(r, 150)));
}
async function leaveMap() {
  await act(async () => {
    mapLines()[0]!.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    map()!.dispatchEvent(new PointerEvent("pointerleave"));
  });
  await act(async () => new Promise((r) => setTimeout(r, 200)));
}

// A line per heading in the margin: no column to make room for, so it is there
// whatever the room, wide page included. A map of one heading is a heading.
test("the heading map draws a line per heading, whatever the room", async () => {
  await mountAt("/wiki/notes/sections.md");
  expect(mapLines().map((a) => a.getAttribute("href"))).toEqual(["#first", "#detail", "#second"]);
  // Deeper is shorter.
  expect(mapLines()[1]!.firstElementChild!.className).toContain("w-2 ");
  expect(mapLines()[0]!.firstElementChild!.className).toContain("w-2.5");
  expect(mapTitles().length).toBe(0); // titles only once it opens

  await readerRoom(400);
  expect(map()).not.toBeNull();
  await readerRoom(1400);
  await act(async () => document.querySelector<HTMLElement>("[aria-label^='Page width']")!.click());
  expect(map()).not.toBeNull();
  await act(async () => document.querySelector<HTMLElement>("[aria-label^='Page width']")!.click());

  // a.md has no headings at all.
  await act(async () => navigateTo("/wiki/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(map()).toBeNull();
});

// The title is the page's, not a section of it, and an h1 further down is.
test("the heading map leaves out the title and takes h1 to h3", async () => {
  const saved = { body: sectionsEntry.body, headings: sectionsEntry.headings };
  sectionsEntry.body = "# Sections\n\n## First\n\n### Also\n\n#### Deep\n\n# Appendix\n";
  sectionsEntry.headings = [
    { level: 1, text: "Sections", id: "sections", line: 5, bodyLine: 1 },
    { level: 2, text: "First", id: "first", line: 7, bodyLine: 3 },
    { level: 3, text: "Also", id: "also", line: 9, bodyLine: 5 },
    { level: 4, text: "Deep", id: "deep", line: 11, bodyLine: 7 },
    { level: 1, text: "Appendix", id: "appendix", line: 13, bodyLine: 9 },
  ];
  try {
    await mountAt("/wiki/notes/sections.md");
    expect(mapLines().map((a) => a.getAttribute("href"))).toEqual(["#first", "#also", "#appendix"]);
    // Depth is from the shallowest listed: the h1 full length, the h2 one step in, the h3 two.
    expect(mapLines()[2]!.firstElementChild!.className).toContain("w-2.5");
    expect(mapLines()[0]!.firstElementChild!.className).toContain("w-2 ");
    expect(mapLines()[1]!.firstElementChild!.className).toContain("w-1.5");
  } finally {
    Object.assign(sectionsEntry, saved);
  }
});

// Resting on the map floats the titles; the one under the pointer is lit in
// the list and on its line. Leaving folds it.
test("resting on the heading map shows the titles, lit under the pointer", async () => {
  await mountAt("/wiki/notes/sections.md");
  await restOnMap();
  expect(mapTitles().map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
    ["First", "#first"],
    ["Detail", "#detail"],
    ["Second", "#second"],
  ]);
  expect(mapTitles()[1]!.style.paddingLeft).toBe("24px"); // an h3 under its h2

  await act(async () => mapTitles()[2]!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  expect(mapTitles()[2]!.className).toContain("text-fg");
  expect(mapLines()[2]!.firstElementChild!.className).toContain("bg-fg");
  expect(mapLines()[0]!.firstElementChild!.className).not.toContain("bg-fg");

  await leaveMap();
  expect(mapTitles().length).toBe(0);
});

// A first tap on a line opens the map rather than jumping, since a line says
// nothing until its title shows; that is also how a touch screen opens it, and
// a click keeps it. Choosing lets go of the click's hold, and the titles stay
// while the pointer does. Escape puts it away until the pointer has left.
test("a click on the map keeps it open, choosing lets go, Escape puts it away", async () => {
  await mountAt("/wiki/notes/sections.md");
  const tap = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => void mapLines()[1]!.dispatchEvent(tap));
  expect(tap.defaultPrevented).toBe(true);
  expect(mapTitles().length).toBe(3);
  await leaveMap();
  expect(mapTitles().length).toBe(3); // kept

  await restOnMap();
  await act(async () => mapTitles()[0]!.click());
  expect(mapTitles().length).toBe(3); // still pointed at, so still showing
  await leaveMap();
  expect(mapTitles().length).toBe(0); // and no longer held

  await restOnMap();
  await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(mapTitles().length).toBe(0);
  await restOnMap();
  expect(mapTitles().length).toBe(0); // not under the pointer that put it away
  await leaveMap();
  await restOnMap();
  expect(mapTitles().length).toBe(3);
});

// A click focuses the link it lands on, and following it hands focus on to
// the page. That is not the pointer leaving: the titles stay while it is there
// (found by the user, who lost the map under the pointer after each click).
test("the heading map stays open under the pointer when focus moves on", async () => {
  await mountAt("/wiki/notes/sections.md");
  await restOnMap();
  const link = mapTitles()[1]!;
  await act(async () => link.focus());
  await act(async () => link.blur());
  await act(async () => new Promise((r) => setTimeout(r, 200))); // past the close
  expect(mapTitles().length).toBe(3);
  await leaveMap();
  expect(mapTitles().length).toBe(0);
});

// Without a pointer: the map has a button to tab to, and focus opens it.
test("the heading map opens from the keyboard", async () => {
  await mountAt("/wiki/notes/sections.md");
  await act(async () => map()!.querySelector<HTMLElement>("button")!.focus());
  expect(mapTitles().length).toBe(3);
});

// Wide widens an article held at the reading width. Where the article already
// has less room than that, it would change nothing, so it is not offered.
test("wide is offered only when the article has room to grow", async () => {
  await mountAt("/wiki/notes/a.md");
  const toggle = () => document.querySelector("[aria-label^='Page width']");
  await readerRoom(680);
  expect(toggle()).toBeNull();
  await readerRoom(681);
  expect(toggle()).not.toBeNull();

  // Chosen and then out of room: the choice is kept, only the button goes,
  // and it comes back pressed.
  await act(async () => (toggle() as HTMLElement).click());
  await readerRoom(600);
  expect(toggle()).toBeNull();
  expect(document.documentElement.getAttribute("data-width")).toBe("wide");
  await readerRoom(1000);
  expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
  await act(async () => (toggle() as HTMLElement).click());
});

// ─── The folder listing ─────────────────────────────────────────────────────

/** Gives the /notes fixture entries times and link counts for one test. */
async function withNotesStamped(run: () => Promise<void>) {
  const notes = tree.children.find((c) => c.path === "/notes")!;
  const saved = notes.entries.map((e) => ({ ...e }));
  const stamp: Record<string, [string | undefined, number]> = {
    "/notes/a.md": ["2026-09-01T10:00:00Z", 4],
    "/notes/b.md": ["2026-09-20T10:00:00Z", 1],
    "/notes/checks.md": [undefined, 0], // no time at all: last when sorting by one
  };
  notes.entries = notes.entries.map((e) => ({ ...e, updated: stamp[e.path]![0], links: stamp[e.path]![1] }));
  try {
    await run();
  } finally {
    notes.entries = saved;
  }
}

const listingRows = () =>
  [...document.querySelectorAll("main ul > li a")].map((a) => a.querySelector("span.font-medium")?.textContent);

test("a listing sorts by name or by when things changed, and remembers which", async () => {
  await withNotesStamped(async () => {
    await mountAt("/wiki/notes/");
    // By name is the tree's order, the filenames' own.
    expect(listingRows()).toEqual(["A", "B", "Checks"]);

    const updated = [...document.querySelectorAll<HTMLElement>("[role='radio']")].find(
      (b) => b.textContent === "Updated",
    )!;
    await act(async () => updated.click());
    // Newest first; the one with no time last rather than first.
    expect(listingRows()).toEqual(["B", "A", "Checks"]);

    // A view preference, so it is still there on the next visit.
    await mountAt("/wiki/notes/");
    expect(listingRows()).toEqual(["B", "A", "Checks"]);
    expect(document.querySelector("[role='radio'][aria-checked='true']")?.textContent).toBe("Updated");
  });
});

test("a listing row says how connected an entry is and when it changed", async () => {
  await withNotesStamped(async () => {
    await mountAt("/wiki/notes/");
    const row = [...document.querySelectorAll("main ul > li a")].find((a) => a.getAttribute("href") === "/wiki/notes/a.md")!;
    expect(row.textContent).toContain("A Note"); // its own title, under the filename
    expect(row.querySelector("[title='4 linked entries']")?.textContent).toBe("4");
    expect(row.lastElementChild?.getAttribute("title")).toBe("2026-09-01T10:00:00Z");
  });
});

// Subfolders sit above entries whichever sort is chosen: a folder has no one
// time of its own to be sorted by.
test("subfolders come first, and the listing says it is generated", async () => {
  const had = tree.index;
  delete tree.index;
  try {
    await mountAt("/wiki/");
    const hrefs = [...document.querySelectorAll("main ul > li a")].map((a) => a.getAttribute("href"));
    expect(hrefs.slice(0, 2)).toEqual(["/wiki/notes/", "/wiki/empty/"]);
    expect(hrefs[2]).toBe("/wiki/index.md");
    // The root has no name of its own; the bundle's is what it is called.
    expect(document.querySelector("main h1")?.textContent).toBe("My kb");
    expect(document.querySelector("main")?.textContent).toContain("Add /index.md to replace it.");
  } finally {
    tree.index = had;
  }
});

test("an empty folder says so, and still says how to give it a page", async () => {
  await mountAt("/wiki/empty/");
  const main = document.querySelector("main")!;
  expect(main.textContent).toContain("Nothing here yet.");
  expect(main.querySelector("ul")).toBeNull();
  expect(main.textContent).toContain("Add /empty/index.md to replace it.");
});

// ─── The board, redrawn ─────────────────────────────────────────────────────

/** Types into an input the way a person does: through the native setter, so
 *  React's own tracking sees the change, then the event it listens for. */
async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const allCards = () =>
  [...document.querySelectorAll("main section[aria-label] a")].map((a) => a.querySelector("span")?.textContent);

// A filter narrows what is on screen by what a card says: its title, its
// filename, or a tag. It lives in the address, so opening a card and closing it
// again comes back to the same narrowing.
test("the board filters by title, filename and tag, and keeps the filter in the URL", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    expect(allCards()).toEqual(["A Note", "Checks", "B", "D"]);
    const filter = document.querySelector<HTMLInputElement>("input[aria-label='Filter cards']")!;

    await typeInto(filter, "NOTE"); // the title, whatever the case
    expect(allCards()).toEqual(["A Note"]);
    await typeInto(filter, "api"); // a tag
    expect(allCards()).toEqual(["A Note"]);
    await typeInto(filter, "check"); // the filename
    expect(allCards()).toEqual(["Checks"]);
    expect(here).toBe("/kanban/notes");
    expect(document.querySelector("main header")!.textContent).toContain("1 of 4 cards");
    // A column the filter empties says why it is empty.
    expect(columnEl("blocked").textContent).toContain("No cards match");

    // Open a card and close it: the filter comes back with you.
    const card = document.querySelector<HTMLAnchorElement>("main section[aria-label] a")!;
    expect(card.getAttribute("href")).toBe("/kanban/notes/notes/checks.md?q=check");
    await act(async () => card.click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(allCards()).toEqual(["Checks"]);

    await typeInto(document.querySelector<HTMLInputElement>("input[aria-label='Filter cards']")!, "");
    expect(allCards()).toEqual(["A Note", "Checks", "B", "D"]);
  } finally {
    restore();
  }
});

// Flat is a way of reading the board: the bands go, the cards stay, the config
// is untouched, and the choice is remembered for this board.
test("a board with lanes can be read flat, and remembers it", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    const bands = () => document.querySelectorAll("main section[aria-label] h3").length;
    expect(bands()).toBeGreaterThan(0);
    const flat = [...document.querySelectorAll<HTMLElement>("[role='radio']")].find((b) => b.textContent === "Flat")!;
    await act(async () => flat.click());
    expect(bands()).toBe(0);
    expect(allCards()).toEqual(["A Note", "Checks", "B", "D"]);

    await mountAt("/kanban/notes");
    expect(bands()).toBe(0);
  } finally {
    restore();
  }
});

// Columns are coloured by where they sit, first gray to last green, the shelf
// gray and the no-status column neutral; the bar says each one's share.
test("columns take the gradient by position, and a bar for their share", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    const dot = (c: string) =>
      columnEl(c).querySelector<HTMLElement>("header > span[aria-hidden]")!.style.getPropertyValue("--c");
    expect(dot("todo")).toBe("var(--color-stage-0)");
    expect(dot("in-progress")).toBe("var(--color-stage-2)"); // three live columns: the middle snaps to amber
    expect(dot("blocked")).toBe("var(--color-stage-3)");
    expect(dot("no status")).toBe("var(--color-faint)");
    const bar = (c: string) => (columnEl(c).querySelector("header > div[aria-hidden] > div") as HTMLElement).style.width;
    expect([bar("todo"), bar("in-progress"), bar("blocked"), bar("no status")]).toEqual(["50%", "0%", "25%", "25%"]);
  } finally {
    restore();
  }
});

// A card names the first thing it waits on and counts the rest, so "blocked"
// says by what without opening it.
test("a waiting card names its first blocker and counts the others", async () => {
  const a = boardFixture.columns[0]!.cards[0]! as { blocker?: string };
  a.blocker = "Ship the parser";
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    const waiting = cardIn("todo", "A Note")!.querySelector(".text-warn")!;
    expect(waiting.textContent).toBe("Waiting on Ship the parser+1");
  } finally {
    restore();
    delete a.blocker;
  }
});

// The entry's own name first, the filename under it — and only once when the
// two say the same.
test("a card leads with the entry's title, the filename beneath", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    const face = (label: string) =>
      [...cardIn("todo", label)!.querySelectorAll(":scope > span")].slice(0, 2).map((s) => s.textContent);
    expect(face("A Note")).toEqual(["A Note", "A"]);
    expect(face("Checks")[0]).toBe("Checks");
    expect(face("Checks")[1]).not.toBe("Checks");
  } finally {
    restore();
  }
});

// ─── The card sheet, as a side panel ────────────────────────────────────────

const sheetEl = () => document.querySelector<HTMLElement>("[data-print='sheet'] [role='dialog']");
/** Opens a sheet's folded properties and keeps them, as a click on their
 *  line does: for tests about what is in them rather than how they fold. */
async function keepSheetProperties() {
  const toggle = document.querySelector<HTMLElement>("[role='dialog'] button[aria-controls='entry-properties']")!;
  if (toggle.getAttribute("aria-expanded") === "false") await act(async () => toggle.click());
}

const choice = (group: string, value: string) =>
  [...document.querySelectorAll<HTMLElement>(`[role='radiogroup'][aria-label='${group}'] [role='radio']`)].find(
    (b) => b.textContent === value,
  )!;

// The sheet's status and lane are the board's, drawn as controls: choosing one
// makes exactly the move a drop would, and the card moves before the answer.
test("a card's status and lane can be chosen in its sheet", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    await keepSheetProperties();
    expect(choice("status", "todo").getAttribute("aria-checked")).toBe("true");
    expect(choice("priority", "high").getAttribute("aria-checked")).toBe("true");

    const writes = captureWrites();
    await act(async () => choice("status", "blocked").click());
    expect(writes).toEqual([
      { url: "/api/card/notes/notes/a.md", body: { value: "blocked", lane: "", version: 1 } },
    ]);
    // Moved on the board at once, not after a round trip.
    expect(cardIn("blocked", "A Note")).toBeTruthy();

    await act(async () => choice("priority", "low").click());
    expect(writes[1]?.body).toEqual({ value: "blocked", lane: "low", version: 1 });
    // Choosing what it already is writes nothing.
    await act(async () => choice("priority", "low").click());
    expect(writes).toHaveLength(2);
  } finally {
    restore();
  }
});

// A refused move puts the card back where it was: the screen agrees with the
// file, not with the click.
test("a refused move from the sheet puts the card back", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    await keepSheetProperties();
    captureWrites(409);
    await act(async () => choice("status", "blocked").click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(cardIn("todo", "A Note")).toBeTruthy();
    expect(cardIn("blocked", "A Note")).toBeFalsy();
  } finally {
    restore();
  }
});

// A card with no status has no column to keep while its lane changes, so its
// lane waits until it has one — rather than writing a status of nothing.
test("a card with no status cannot change lane from its sheet", async () => {
  // Checks, moved into the column of cards with no status for this test: it is
  // an entry the fixture serves, so its sheet has a body and a grid.
  const [todo, , , unset] = boardFixture.columns;
  const checks = todo!.cards.splice(1, 1)[0]!;
  (unset!.cards as unknown[]).push(checks);
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/checks.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    await keepSheetProperties();
    expect(document.querySelector("[role='radiogroup'][aria-label='status'] [aria-checked='true']")).toBeNull();
    expect(choice("priority", "high").hasAttribute("disabled")).toBe(true);
  } finally {
    restore();
    unset!.cards.pop();
    (todo!.cards as unknown[]).splice(1, 0, checks);
  }
});

// Links followed inside the sheet can be walked back, in the sheet — and the
// history is the sheet's, gone when it closes.
test("the sheet walks back through what it has shown", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    await keepSheetProperties();
    expect(sheetEl()!.querySelector("[aria-label='Back']")).toBeNull();

    // `blockers: /notes/b.md` is on this board, so it opens in the sheet.
    const b = [...sheetEl()!.querySelectorAll("dl a")].find((a) => a.textContent === "B")!;
    await act(async () => (b as HTMLElement).click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(here).toBe("/kanban/notes/notes/b.md");

    await act(async () => sheetEl()!.querySelector<HTMLElement>("[aria-label='Back']")!.click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(here).toBe("/kanban/notes/notes/a.md");
    expect(sheetEl()!.querySelector("[aria-label='Back']")).toBeNull();
  } finally {
    restore();
  }
});

// The board stays live under the sheet: a press on empty board is done with
// the card; a press on a card or a control is not.
test("pressing the empty board closes the sheet, and pressing a card does not", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const press = (el: Element) =>
      act(async () => void el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));

    await press(cardIn("blocked", "B")!);
    await press(document.querySelector("input[aria-label='Filter cards']")!);
    await press(sheetEl()!);
    expect(here).toBe("/kanban/notes/notes/a.md");

    await press(document.querySelector("[data-scroller]")!);
    expect(here).toBe("/kanban/notes");
  } finally {
    restore();
  }
});

// One press, one layer: the palette over a card closes and leaves the card.
test("Escape closes the topmost layer only", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const escape = () => act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true })));
    expect(document.querySelector("[aria-label='Search']")).not.toBeNull();

    await escape();
    expect(document.querySelector("[aria-label='Search']")).toBeNull();
    expect(here).toBe("/kanban/notes/notes/a.md");

    await escape();
    expect(here).toBe("/kanban/notes");
  } finally {
    restore();
  }
});

// ─── The graph, redrawn ─────────────────────────────────────────────────────

/** Points at a node the way a mouse does: React hears enter through `over`. */
async function pointAt(path: string) {
  const node = document.querySelector(`main svg [data-path='${path}']`)!;
  await act(async () => node.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await act(async () => node.dispatchEvent(new PointerEvent("pointerenter")));
}

const labelled = () =>
  [...document.querySelectorAll("main svg [data-path]")].filter((g) => g.querySelector("text")).map((g) => g.getAttribute("data-path"));

// Typing lights the nodes that match and fades the rest, and names the ones it
// found whatever the label mode says.
test("the highlight lights matching nodes and names them", async () => {
  await openGraph();
  await act(async () => [...document.querySelectorAll<HTMLElement>("[role='radio']")].find((b) => b.textContent === "None")!.click());
  expect(labelled()).toEqual([]);

  await typeInto(document.querySelector<HTMLInputElement>("input[aria-label='Highlight nodes']")!, "note");
  const node = (p: string) => document.querySelector(`main svg [data-path='${p}']`)!;
  // "A Note" matches by its title; D does not.
  expect(node("/notes/a.md").getAttribute("opacity")).toBe("1");
  expect(Number(node("/notes/d.md").getAttribute("opacity"))).toBeLessThan(0.5);
  expect(labelled()).toContain("/notes/a.md");
  expect(labelled()).not.toContain("/notes/d.md");
});

// Hubs names every node on a graph this small; None names only what you point
// at; the choice is remembered.
test("label modes: hubs names a small graph whole, none names only the pointed-at", async () => {
  await openGraph();
  const all = [...document.querySelectorAll("main svg [data-path]")].map((g) => g.getAttribute("data-path"));
  expect(labelled()).toEqual(all);

  await act(async () => [...document.querySelectorAll<HTMLElement>("[role='radio']")].find((b) => b.textContent === "None")!.click());
  expect(labelled()).toEqual([]);
  await pointAt("/notes/a.md");
  expect(labelled()).toContain("/notes/a.md");

  await openGraph();
  expect(document.querySelector("[role='radio'][aria-checked='true']")?.textContent).toBe("None");
});

// Setting a group aside takes its nodes and their edges off the canvas, and
// putting it back returns them; the choice is kept for this graph.
test("the groups legend hides a group's nodes and brings them back", async () => {
  pinLegend();
  // Over the whole bundle, where /notes is a group and the front door is not in
  // any: two rows to tell apart.
  await mountWithGraphs([{ path: "/", id: "all", name: "Everything", entries: 3 }], {
    ...graphFixture,
    id: "all",
    path: "/",
    nodes: [
      { path: "/index.md", label: "Index" },
      { path: "/notes/a.md", label: "A" },
      { path: "/notes/b.md", label: "B" },
    ],
    edges: [
      { from: "/index.md", to: "/notes/a.md", via: ["body"], count: 1 },
      { from: "/notes/a.md", to: "/notes/b.md", via: ["body"], count: 1 },
    ],
  });
  await act(async () => navigateTo("/graph/all"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const rows = () =>
    [...document.querySelectorAll("[role='group'][aria-label='Groups'] [data-legend-row] > button:first-child")].map((b) => b.textContent);
  // The graph's own folder first, under its name — the bundle's, over "/".
  expect(rows()).toEqual(["My kb", "Notes"]);
  const counts = [...document.querySelectorAll("[role='group'][aria-label='Groups'] [data-legend-row] > button:last-child span.font-mono")];
  expect(counts.map((c) => c.textContent)).toEqual(["1", "2"]);
  const drawn = () => [...document.querySelectorAll("main svg [data-path]")].map((g) => g.getAttribute("data-path"));
  const edges = () => document.querySelectorAll("main svg line.stroke-edge").length;
  expect(edges()).toBe(2);

  const notes = [...document.querySelectorAll<HTMLElement>("[role='group'][aria-label='Groups'] [data-legend-row] > button:first-child")][1]!;
  await act(async () => notes.click());
  expect(drawn()).toEqual(["/index.md"]);
  expect(edges()).toBe(0); // an edge with either end set aside goes with it
  expect(notes.getAttribute("aria-pressed")).toBe("false");

  // Kept for this graph.
  await act(async () => navigateTo("/wiki/index.md"));
  await act(async () => navigateTo("/graph/all"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(drawn()).toEqual(["/index.md"]);
  await act(async () => [...document.querySelectorAll<HTMLElement>("[role='group'][aria-label='Groups'] [data-legend-row] > button:first-child")][1]!.click());
  expect(drawn()).toEqual(["/index.md", "/notes/a.md", "/notes/b.md"]);
});

// The zoom buttons change the view the way the wheel does, and fit brings
// every node back inside the canvas.
test("the zoom controls zoom, and fit frames the graph", async () => {
  await openGraph();
  const gap = () => {
    const a = positionOf("/notes/a.md");
    const d = positionOf("/notes/d.md");
    return Math.hypot(a.x - d.x, a.y - d.y);
  };
  const start = gap();
  await act(async () => document.querySelector<HTMLElement>("[aria-label='Zoom in']")!.click());
  expect(gap()).toBeCloseTo(start * 1.25, 1);
  await act(async () => document.querySelector<HTMLElement>("[aria-label='Zoom out']")!.click());
  await act(async () => document.querySelector<HTMLElement>("[aria-label='Zoom out']")!.click());
  expect(gap()).toBeCloseTo(start / 1.25, 1);

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Fit the graph']")!.click());
  // Every node inside the canvas's box, around its middle.
  const g = document.querySelector("main svg[role='img'] > g")!.getAttribute("transform")!;
  const [ox, oy] = g.replace(/translate\(|\)/g, "").split(" ").map(Number);
  for (const node of document.querySelectorAll("main svg [data-path]")) {
    const [x, y] = node.getAttribute("transform")!.replace(/translate\(|\)/g, "").split(" ").map(Number);
    expect(ox! + x!).toBeGreaterThanOrEqual(0);
    expect(oy! + y!).toBeGreaterThanOrEqual(0);
    expect(ox! + x!).toBeLessThanOrEqual(800);
    expect(oy! + y!).toBeLessThanOrEqual(600);
  }
});

// Pointing at a node says what it is without opening it.
test("hovering a node shows its card, and the open node is ringed", async () => {
  await mountAt("/graph/notes/notes/a.md");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(document.querySelector("main svg [data-path='/notes/a.md'] circle")?.getAttribute("class")).toContain("stroke-fg");

  await pointAt("/notes/d.md");
  const card = [...document.querySelectorAll("main div[aria-hidden]")].find((n) => n.textContent?.includes("Click to preview"));
  expect(card?.textContent).toContain("connection");
});

// ─── Recently changed and Read later, redrawn ───────────────────────────────

// A changed row says how long ago, and its "mark seen" stays out of the way
// until you reach for it — by mouse or by keyboard, since focus shows it too.
test("a changed row says how long ago, and its tick is there for the keyboard", async () => {
  await mountAt("/wiki/index.md");
  const moved = withChange("/notes/b.md", 2);
  const notes = moved.children.find((c) => c.path === "/notes")!;
  notes.entries = notes.entries.map((e) =>
    e.path === "/notes/b.md" ? { ...e, updated: new Date(Date.now() - 2 * 3600_000).toISOString() } : e,
  );
  const restore = await reportTree(moved, 2);
  try {
    await act(async () => openSection("Recently changed"));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(pageRows()).toHaveLength(1);
    expect(pageRows()[0]).toContain("2 h ago");
    const tick = document.querySelector<HTMLElement>("main li [aria-label='Mark B as seen']")!;
    // Hidden by opacity, never removed: a hidden control a keyboard cannot
    // reach would be a control only the mouse has.
    expect(tick.className).toContain("opacity-0");
    expect(tick.className).toContain("focus-visible:opacity-100");
    await act(async () => tick.click());
    expect(pageRows()).toEqual([]);
    expect(document.querySelector("main")!.textContent).toContain("Nothing has changed since you were last here.");
  } finally {
    restore();
  }
});

// While a saved row is dragged, the row it would land before carries the line.
test("dragging a saved row marks where it would land", async () => {
  localStorage.setItem(`wiki:${bundle.id}:queue`, JSON.stringify(["/notes/a.md", "/notes/b.md", "/notes/checks.md"]));
  await mountAt("/read-later");
  const rows = () => [...document.querySelectorAll<HTMLElement>("main li")];
  const handle = rows()[2]!.querySelector<HTMLElement>("button[aria-label^='Reorder']")!;
  const real = document.elementFromPoint;
  document.elementFromPoint = () => rows()[0]!;
  try {
    await act(async () => void handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", clientX: 10, clientY: 200, button: 0 })));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: 10, clientY: 20 })));
    expect(rows()[0]!.className).toContain("shadow-[0_-3px_0_-1px_var(--color-accent)]");
    expect(rows()[2]!.className).toContain("opacity-40"); // left in place, dimmed
  } finally {
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", clientX: 10, clientY: 20 })));
    document.elementFromPoint = real;
  }
});

// ─── The palette runs commands ──────────────────────────────────────────────

async function openPalette() {
  await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true })));
}
const paletteRows = () =>
  [...document.querySelectorAll("[role='dialog'][aria-label='Search'] li button")].map(
    (b) => b.querySelector("span.font-medium span")?.textContent,
  );
const runCommand = async (title: string) => {
  const b = [...document.querySelectorAll<HTMLElement>("[role='dialog'][aria-label='Search'] li button")].find(
    (x) => x.querySelector("span.font-medium span")?.textContent === title,
  )!;
  await act(async () => b.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
};

// Every declared board and graph is one command away, and a view is too.
test("the palette opens a board, a graph, and the lists", async () => {
  await mountAt("/wiki/index.md");
  await openPalette();
  expect(paletteRows()).toContain("Open board · Notes");
  expect(paletteRows()).toContain("Open graph · Who links whom");
  await runCommand("Open graph · Who links whom");
  expect(here).toBe("/graph/notes");
  // It closes when it has done what it was asked.
  expect(document.querySelector("[role='dialog'][aria-label='Search']")).toBeNull();

  await openPalette();
  await runCommand("Read later");
  expect(here).toBe("/read-later");
});

// The palette and the header button are one theme, not two that agree later.
test("toggling the theme from the palette moves the header button too", async () => {
  await mountAt("/wiki/index.md");
  const button = () => document.querySelector("header [aria-label^='Theme:']")!.getAttribute("aria-label");
  expect(button()).toStartWith("Theme: Match system");
  await openPalette();
  await runCommand("Toggle theme");
  expect(button()).toStartWith("Theme: Light");
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  document.documentElement.removeAttribute("data-theme");
});

// Git commands open the popover on the tab they name — and are not offered at
// all where there is no upstream, as the pill is not.
test("git commands open the source-control popover on their tab", async () => {
  await mountWithGit({ behind: 3, changes: [{ path: "notes/a.md", code: " M" }] });
  await openPalette();
  expect(paletteRows().slice(0, 2)).toEqual(["Pull 3 commits", "Commit & push…"]);
  await runCommand("Commit & push…");
  expect(document.querySelector("[role='tab'][aria-selected='true']")?.textContent).toStartWith("Changes");

  await mountWithGit({ repo: false, remote: "" });
  await openPalette();
  expect(paletteRows()).not.toContain("Commit & push…");
  expect(paletteRows()[0]).toBe("Toggle theme");
});

// Arrows wrap, and Enter runs the one they are on — an entry navigates.
test("arrow keys wrap and Enter opens the selected item", async () => {
  await mountAt("/wiki/index.md");
  await openPalette();
  const input = document.querySelector<HTMLInputElement>("[aria-label='Search entries and commands']")!;
  const key = (k: string) => act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
  const current = () => document.querySelector("[role='dialog'] li button[aria-current='true'] span.font-medium span")?.textContent;
  const first = current();
  await key("ArrowUp");
  expect(current()).toBe(paletteRows()[paletteRows().length - 1]);
  await key("ArrowDown");
  expect(current()).toBe(first);

  await typeInto(input, "checks");
  expect(current()).toBe("Checks");
  await key("Enter");
  expect(here).toBe("/wiki/notes/checks.md");
});

// A column in the settings list wears the colour the board draws it in, so the
// list reads as the board's columns.
test("settings draws each pinned column in its board colour", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    const onBoard = columnEl("todo").querySelector<HTMLElement>("header > span[aria-hidden]")!.style.getPropertyValue("--c");
    await act(async () => openSettings());
    const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
    const row = [...dialog.querySelectorAll("[aria-label^='Pinned '] li")].find(
      (li) => li.querySelector("span.font-mono")?.textContent === "todo",
    )!;
    expect(row.querySelector<HTMLElement>("span[aria-hidden]")!.style.getPropertyValue("--c")).toBe(onBoard);
  } finally {
    restore();
  }
});

// ─── Toasts ─────────────────────────────────────────────────────────────────

const toastText = () => document.querySelector("[role='status']")?.textContent ?? null;

// Every bookmark goes through one place, so each one says what it did.
test("saving to read later says so, and so does taking it off", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => document.querySelector<HTMLElement>("[aria-label='Save to read later']")!.click());
  expect(toastText()).toBe("Saved to Read later");
  await act(async () => document.querySelector<HTMLElement>("[aria-label='Remove from read later']")!.click());
  expect(toastText()).toBe("Removed from Read later");
});

// One at a time, and gone after a beat — timed from the newest, so a quick
// second toast gets its full time rather than the rest of the first's.
test("a toast replaces the last one and leaves after a moment", async () => {
  await mountAt("/wiki/notes/a.md");
  const save = () => document.querySelector<HTMLElement>("article [aria-label$='read later']")!;
  await act(async () => save().click());
  await act(async () => new Promise((r) => setTimeout(r, 2000)));
  await act(async () => save().click());
  expect(document.querySelectorAll("[role='status']")).toHaveLength(1);
  expect(toastText()).toBe("Removed from Read later");
  // 2.0s into the first; the second has its own 2.6s from here.
  await act(async () => new Promise((r) => setTimeout(r, 1000)));
  expect(toastText()).toBe("Removed from Read later");
  await act(async () => new Promise((r) => setTimeout(r, 1800)));
  expect(toastText()).toBeNull();
}, 10_000);

// A move says where the card went; a refused one says why, in the server's
// words, in the colour of a failure.
test("moving a card says where it went, and a refusal says why", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    await keepSheetProperties();
    captureWrites();
    await act(async () => choice("status", "blocked").click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(toastText()).toBe("Moved to blocked");

    captureWrites(409);
    await act(async () => choice("priority", "low").click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(toastText()).toBe(refusal);
    expect(document.querySelector("[role='status'] span[aria-hidden]")!.className).toContain("bg-danger");
  } finally {
    restore();
  }
});

// ─── States ─────────────────────────────────────────────────────────────────

// A server restarting after a rebuild is the usual reason the bundle is out of
// reach, and trying again is the one thing worth offering. It is the same load.
test("an unreachable bundle says so, and Retry loads it once it is back", async () => {
  await mountAt("/wiki/index.md");
  const real = globalThis.fetch;
  let down = true;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    down && String(input).endsWith("/api/bundle")
      ? Promise.resolve(new Response(JSON.stringify({ error: "connection refused" }), { status: 502, headers: { "content-type": "application/json" } }))
      : real(input, init)) as typeof fetch;
  try {
    // An unseen version refetches, which is when the outage is met.
    await act(async () => emitVersion(98));
    await act(async () => emitVersion(99));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(document.body.textContent).toContain("Cannot reach the bundle");
    expect(document.body.textContent).toContain("connection refused");

    down = false;
    const retry = [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Retry")!;
    await act(async () => retry.click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(document.body.textContent).not.toContain("Cannot reach the bundle");
    expect(document.querySelector("article")).not.toBeNull();
  } finally {
    globalThis.fetch = real;
  }
});

// A not-found page is a way back, not a dead end.
test("nothing at an address offers the way back to the front door", async () => {
  await mountAt("/README.md");
  const back = [...document.querySelectorAll("main a, #root a")].find((a) => a.textContent === "Go to the front door");
  expect(back?.getAttribute("href")).toBe("/");
});

// ─── Narrow screens ─────────────────────────────────────────────────────────

/** Runs a test at phone width. Mounted wide and narrowed after, for the
 *  happy-dom quirk `viewport` explains; restored whatever happens. */
async function onAPhone(path: string, run: () => Promise<void>) {
  await mountAt(path);
  await viewport(600);
  try {
    await run();
  } finally {
    await viewport(1024);
  }
}

// The rail becomes a tab bar, the trail goes, and the panel waits in a drawer.
test("a narrow screen swaps the rail for a tab bar, and the layout follows the width live", async () => {
  await onAPhone("/wiki/notes/a.md", async () => {
    const sections = () => document.querySelector("nav[aria-label='Sections']");
    expect(sections()?.className).toContain("grid-cols-5"); // the tab bar
    expect(sections()?.textContent).toBe("EntriesBoardsGraphsChangedLater");
    expect(document.querySelector("nav[aria-label='Breadcrumb']")).toBeNull();
    expect(document.querySelector("aside")).toBeNull(); // no panel until asked

    await viewport(1024);
    expect(sections()?.className).not.toContain("grid-cols-5"); // the rail again
    expect(document.querySelector("nav[aria-label='Breadcrumb']")).not.toBeNull();
    await viewport(600);
  });
});

// The drawer is how you move around on a phone: the hamburger opens it, and
// going somewhere, the backdrop, or Escape closes it.
test("the drawer opens from the hamburger and closes on navigation and Escape", async () => {
  await onAPhone("/wiki/index.md", async () => {
    const drawer = () => document.querySelector("aside[aria-label='Panel']");
    const hamburger = () => document.querySelector<HTMLElement>("[aria-label='Open the panel']")!;

    await act(async () => hamburger().click());
    expect(drawer()?.textContent).toContain("Entries");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(drawer()).toBeNull();

    await act(async () => hamburger().click());
    const notes = [...drawer()!.querySelectorAll("a")].find((a) => a.textContent === "Notes")!;
    await act(async () => notes.click());
    expect(here).toBe("/wiki/notes/");
    expect(drawer()).toBeNull();
  });
});

// A tab takes you to its section; tapped again where you are, it opens that
// section's panel, since there is none beside the view to toggle.
test("a tab navigates, and tapped again opens its panel in the drawer", async () => {
  await onAPhone("/wiki/index.md", async () => {
    const tab = (label: string) =>
      document.querySelector<HTMLElement>(`nav[aria-label='Sections'] button[title='${label}']`)!;
    await act(async () => tab("Read later").click());
    expect(here).toBe("/read-later");
    await act(async () => tab("Entries").click());
    await act(async () => tab("Entries").click());
    expect(document.querySelector("aside[aria-label='Panel']")).not.toBeNull();
  });
});

// A card rises from the bottom over a backdrop; the board's columns are most
// of the width and snap.
test("on a phone the card sheet is a bottom sheet and columns snap", async () => {
  const restore = stubBoard();
  try {
    await onAPhone("/kanban/notes/notes/a.md", async () => {
      await act(async () => new Promise((r) => setTimeout(r, 0)));
      expect(document.querySelector("[data-print='sheet']")?.className).toContain("top-[14vh]");
      expect(document.querySelector("[data-print='sheet'] [role='dialog']")?.className).toContain("rounded-t-[18px]");
      expect(columnEl("todo").className).toContain("w-[84vw]");
      expect(document.querySelector("[data-scroller]")?.className).toContain("snap-mandatory");
    });
  } finally {
    restore();
  }
});

// ─── Folded properties, and contents that make way ──────────────────────────

const propertiesToggle = () => document.querySelector<HTMLElement>("article button[aria-controls='entry-properties']");

// Folded, the properties are one line of what they say; open, the grid; and
// whichever you left them is how the next entry opens.
test("the reader's properties fold to one line, open on a click, and stay as left", async () => {
  await mountAt("/wiki/notes/a.md");
  expect(document.querySelector("article dl")).toBeNull();
  // status, then the one blocker by its name.
  expect(propertiesToggle()!.textContent).toBe("todo·B");
  expect(propertiesToggle()!.getAttribute("aria-expanded")).toBe("false");

  await act(async () => propertiesToggle()!.click());
  expect(document.querySelector("article dl a")?.textContent).toBe("B");

  await act(async () => navigateTo("/wiki/notes/sections.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(document.querySelector("article dl")).not.toBeNull();
  await act(async () => propertiesToggle()!.click());
  // Tags keep their dots on the one line; a plain list reads as a list.
  expect(propertiesToggle()!.textContent).toBe("apiui·ana, jordi");
  expect(propertiesToggle()!.querySelectorAll("span[aria-hidden].rounded-full")).toHaveLength(2);
});


// ─── Waiting, shelves, and what a drag lights ───────────────────────────────

/** Starts a drag of `el` and moves it over `onto`, leaving it in the air so a
 *  test can look at the board mid-gesture. Returns the release. */
async function holdOver(el: Element, onto: () => Element | null) {
  const real = document.elementFromPoint;
  document.elementFromPoint = () => onto();
  await act(async () =>
    void el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse", clientX: 10, clientY: 10 })),
  );
  // Twice, as a real pointer does: the first move lifts the card, which is what
  // brings the empty bands into being, and the second finds the one under it.
  for (const x of [300, 302]) {
    await act(async () =>
      void window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: x, clientY: 40 })),
    );
  }
  return async () => {
    await act(async () =>
      void window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "mouse", clientX: 300, clientY: 40 })),
    );
    document.elementFromPoint = real;
  };
}

// On a shelf, what a card waits on no longer matters, so the card stops saying.
test("a card on a shelf does not say what it waits on", async () => {
  const shelf = {
    value: "archived",
    pinned: true,
    cards: [{ path: "/notes/z.md", label: "Z", type: "task", lane: "low", blockedBy: 1, blocker: "B" }],
  };
  (boardFixture.columns as unknown[]).splice(3, 0, shelf);
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    expect(cardIn("archived", "Z")!.textContent).not.toContain("Waiting on");
    // Off the shelf, the same edge is said, in amber rather than red.
    const waiting = cardIn("todo", "A Note")!.querySelector("span.text-warn");
    expect(waiting?.textContent).toContain("Waiting on");
    expect(cardIn("todo", "A Note")!.querySelector(".text-danger")).toBeNull();
  } finally {
    restore();
    (boardFixture.columns as unknown[]).splice(3, 1);
  }
});

// With lanes, a card in the air lights the one band it would land in — the
// band under the pointer — and not the column around it.
test("with lanes on, a dragged card lights only the band it would land in", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    const band = () => columnEl("blocked").querySelector("[data-lane='high']")!;
    const release = await holdOver(cardIn("todo", "Checks")!, band);
    try {
      expect(columnEl("blocked").className).not.toContain("border-accent");
      expect(band().className).toContain("bg-accent-bg");
      // The column's other bands stay quiet.
      expect(columnEl("blocked").querySelector("[data-lane='low']")!.className).not.toContain("bg-accent-bg");
    } finally {
      await release();
    }
  } finally {
    restore();
  }
});

// Over the column but not over a band — its header, say — the card would keep
// its own lane, so that is the band lit.
test("over a column but no band, the card's own lane is the one lit", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    const header = () => columnEl("blocked").querySelector("header")!;
    // A Note is in the high lane.
    const release = await holdOver(cardIn("todo", "A Note")!, header);
    try {
      expect(columnEl("blocked").querySelector("[data-lane='high']")!.className).toContain("bg-accent-bg");
      expect(columnEl("blocked").querySelector("[data-lane='low']")!.className).not.toContain("bg-accent-bg");
    } finally {
      await release();
    }
  } finally {
    restore();
  }
});

// Flat, there are no bands to aim at, so the column is what lights.
test("with lanes off, a dragged card lights the column", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    const flat = [...document.querySelectorAll<HTMLElement>("[role='radio']")].find((b) => b.textContent === "Flat")!;
    await act(async () => flat.click());
    const release = await holdOver(cardIn("todo", "Checks")!, () => columnEl("blocked"));
    try {
      expect(columnEl("blocked").className).toContain("border-accent");
    } finally {
      await release();
    }
  } finally {
    restore();
  }
});

// A column picked up by its header has weight like a card does: a copy under
// the pointer, the original dimmed where it was, a line where it would land.
test("dragging a column shows it moving, and where it would land", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes");
    const header = columnEl("blocked").querySelector("header")!;
    const release = await holdOver(header, () => columnEl("todo"));
    try {
      const ghost = [...document.querySelectorAll("div.fixed.rotate-1")].find((d) => d.textContent?.includes("blocked"));
      expect(ghost).toBeTruthy();
      expect(columnEl("blocked").className).toContain("opacity-40");
      expect(columnEl("todo").className).toContain("shadow-[-8px_0_0_-5px_var(--color-accent)]");
      // The column is not a card, so no band lights while it moves.
      expect(document.querySelector("main section [data-lane].bg-accent-bg")).toBeNull();
    } finally {
      await release();
    }
    expect(document.querySelector("div.fixed.rotate-1")).toBeNull();
  } finally {
    restore();
  }
});

// ─── The sheet's width ──────────────────────────────────────────────────────

const sheetWidth = () => document.querySelector<HTMLElement>("[data-print='sheet']")!.style.getPropertyValue("--sheet");

// Dragging the left edge left widens it; arrows do the same a step at a time;
// it keeps a readable minimum; double-click puts it back; and it is remembered.
test("the card sheet can be resized from its left edge, and stays as sized", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(sheetWidth()).toBe("480px");
    const handle = () => document.querySelector<HTMLElement>("[role='separator'][aria-label='Resize the panel']")!;
    const pointer = (type: string, x: number) =>
      act(async () => void handle().dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse", clientX: x })));

    await pointer("pointerdown", 1000);
    await pointer("pointermove", 880); // 120px to the left
    await pointer("pointerup", 880);
    expect(sheetWidth()).toBe("600px");

    await act(async () => void handle().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(sheetWidth()).toBe("576px");

    // Not narrower than it reads well at, however far it is pulled.
    await pointer("pointerdown", 500);
    await pointer("pointermove", 1400);
    await pointer("pointerup", 1400);
    expect(sheetWidth()).toBe("360px");

    // Remembered across a reload.
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(sheetWidth()).toBe("360px");
    await act(async () => void handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(sheetWidth()).toBe("480px");
  } finally {
    restore();
  }
});

// The sheet's header says where the entry is; the body starts with its title.
test("the card sheet opens on the title, with no path above it", async () => {
  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const article = document.querySelector("[data-print='sheet'] article")!;
    expect(article.firstElementChild?.tagName).toBe("H1");
    expect(article.textContent).not.toContain("/notes/a.md");
  } finally {
    restore();
  }
});

// Pointing at a legend row lights that group on the canvas, names its nodes and
// the edges between them, and dims the rest — as pointing at a node does.
test("hovering a group in the legend lights it and dims the rest", async () => {
  pinLegend();
  await mountWithGraphs([{ path: "/", id: "all", name: "Everything", entries: 3 }], {
    ...graphFixture,
    id: "all",
    path: "/",
    nodes: [
      { path: "/index.md", label: "Index" },
      { path: "/notes/a.md", label: "A" },
      { path: "/notes/b.md", label: "B" },
    ],
    edges: [
      { from: "/index.md", to: "/notes/a.md", via: ["body"], count: 1 },
      { from: "/notes/a.md", to: "/notes/b.md", via: ["body"], count: 1 },
    ],
  });
  await act(async () => navigateTo("/graph/all"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // Names off, so any name drawn is one the hover asked for.
  await act(async () => [...document.querySelectorAll<HTMLElement>("[role='radio']")].find((b) => b.textContent === "None")!.click());

  const row = (label: string) =>
    [...document.querySelectorAll<HTMLElement>("[role='group'][aria-label='Groups'] [data-legend-row] > button:first-child")].find((b) =>
      b.textContent?.startsWith(label),
    )!;
  const opacity = (p: string) => Number(document.querySelector(`main svg [data-path='${p}']`)!.getAttribute("opacity"));
  const lit = () => document.querySelectorAll("main svg line[class~='stroke-fg/60']").length;

  await act(async () => row("Notes").dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await act(async () => row("Notes").dispatchEvent(new PointerEvent("pointerenter")));
  expect(opacity("/notes/a.md")).toBe(1);
  expect(opacity("/notes/b.md")).toBe(1);
  expect(opacity("/index.md")).toBeLessThan(0.5);
  expect(labelled()).toEqual(["/notes/a.md", "/notes/b.md"]);
  // Only the edge inside the group: a–b, not the one out to the front door.
  expect(lit()).toBe(1);

  await act(async () => row("Notes").dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
  await act(async () => row("Notes").dispatchEvent(new PointerEvent("pointerleave")));
  expect(opacity("/index.md")).toBe(1);
  expect(labelled()).toEqual([]);
  expect(lit()).toBe(0);

  // Keyboard focus lights it too; a group set aside has nothing to light.
  await act(async () => row("My kb").focus());
  expect(opacity("/notes/a.md")).toBeLessThan(0.5);
  await act(async () => row("My kb").blur());
  await act(async () => row("Notes").click()); // set aside
  await act(async () => row("Notes").focus());
  expect(opacity("/index.md")).toBe(1);
});

/** The groups legend, pinned open before mounting: tests about its rows are
 *  tests of someone using them, who keeps it open. The fold has its own. */
function pinLegend() {
  localStorage.setItem(`wiki:${bundle.id}:graph:legend`, "true");
}

/** A graph over the whole bundle: /notes is a group, the front door is not. */
async function mountGroupsGraph() {
  pinLegend();
  await mountWithGraphs([{ path: "/", id: "all", name: "Everything", entries: 3 }], {
    ...graphFixture,
    id: "all",
    path: "/",
    nodes: [
      { path: "/index.md", label: "Index" },
      { path: "/notes/a.md", label: "A" },
      { path: "/notes/b.md", label: "B" },
    ],
    edges: [
      { from: "/index.md", to: "/notes/a.md", via: ["body"], count: 1 },
      { from: "/notes/a.md", to: "/notes/b.md", via: ["body"], count: 1 },
    ],
  });
  await act(async () => navigateTo("/graph/all"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}
const legendRow = (label: string) =>
  [...document.querySelectorAll<HTMLElement>("[role='group'][aria-label='Groups'] > div")].find((d) =>
    d.querySelector("button")?.textContent?.startsWith(label),
  )!;
const nodeOpacity = (p: string) => Number(document.querySelector(`main svg [data-path='${p}']`)!.getAttribute("opacity"));
const drawnNodes = () => [...document.querySelectorAll("main svg [data-path]")].map((g) => g.getAttribute("data-path"));

// Hiding the group you are pointing at used to leave every node dimmed: the
// hover still lit a group that was no longer drawn.
test("hiding the group you point at leaves the rest lit, not dimmed", async () => {
  await mountGroupsGraph();
  const toggle = legendRow("Notes").querySelector("button")!;
  await act(async () => toggle.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await act(async () => legendRow("Notes").dispatchEvent(new PointerEvent("pointerenter")));
  expect(nodeOpacity("/index.md")).toBeLessThan(0.5); // lit Notes, dimmed the rest

  await act(async () => toggle.click()); // hidden, with the pointer still on it
  expect(drawnNodes()).toEqual(["/index.md"]);
  expect(nodeOpacity("/index.md")).toBe(1);
});

// "Show only" in the count's place: everything else set aside, and — pressed
// again while it is the only group showing — everything back.
test("show only one group, then show them all again", async () => {
  await mountGroupsGraph();
  const solo = () => legendRow("Notes").querySelector<HTMLElement>("button[aria-pressed]:last-child")!;
  expect(solo().getAttribute("aria-label")).toBe("Show only Notes");
  // The count is what the slot shows at rest.
  expect(solo().querySelector("span.font-mono")?.textContent).toBe("2");

  await act(async () => solo().click());
  expect(drawnNodes()).toEqual(["/notes/a.md", "/notes/b.md"]);
  expect(solo().getAttribute("aria-label")).toBe("Show all groups");
  expect(solo().getAttribute("aria-pressed")).toBe("true");
  // While in force the button stays, in place of the count.
  expect(solo().querySelector("span.font-mono")).toBeNull();

  await act(async () => solo().click());
  expect(drawnNodes()).toEqual(["/index.md", "/notes/a.md", "/notes/b.md"]);
});

const enterRow = async (label: string) => {
  await act(async () => legendRow(label).querySelector("button")!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await act(async () => legendRow(label).dispatchEvent(new PointerEvent("pointerenter")));
};
const leaveRow = async (label: string) => {
  await act(async () => legendRow(label).querySelector("button")!.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
  await act(async () => legendRow(label).dispatchEvent(new PointerEvent("pointerleave")));
};

// A hidden group can be looked at without being brought back: pointing at its
// row draws it, lit, for as long as you point. But not under the click that
// hid it — that one waits for the pointer to leave and come back.
test("pointing at a hidden group previews it, except straight after hiding it", async () => {
  await mountGroupsGraph();
  await enterRow("Notes");
  await act(async () => legendRow("Notes").querySelector("button")!.click());
  expect(drawnNodes()).toEqual(["/index.md"]); // hidden, and not previewed under the click

  await leaveRow("Notes");
  expect(drawnNodes()).toEqual(["/index.md"]);
  await enterRow("Notes");
  expect(drawnNodes()).toEqual(["/index.md", "/notes/a.md", "/notes/b.md"]); // the preview
  expect(nodeOpacity("/notes/a.md")).toBe(1);
  expect(nodeOpacity("/index.md")).toBeLessThan(0.5); // the rest dimmed, as for any group

  await leaveRow("Notes");
  expect(drawnNodes()).toEqual(["/index.md"]); // still hidden: the preview changed nothing
  expect(legendRow("Notes").querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
});

// Whenever anything is set aside, the legend offers everything back at once.
test("show all appears while a group is hidden, and brings every one back", async () => {
  await mountGroupsGraph();
  const showAll = () =>
    [...document.querySelectorAll<HTMLElement>("[role='group'][aria-label='Groups'] button")].find(
      (b) => b.textContent === "show all",
    );
  expect(showAll()).toBeUndefined();

  await act(async () => legendRow("Notes").querySelector("button")!.click());
  await act(async () => legendRow("My kb").querySelector("button")!.click());
  expect(drawnNodes()).toEqual([]);
  await act(async () => showAll()!.click());
  expect(drawnNodes()).toEqual(["/index.md", "/notes/a.md", "/notes/b.md"]);
  expect(showAll()).toBeUndefined();
});

// The entries in the graph's own folder are named after it and listed first;
// neighbours, which come from anywhere, are a row of their own, listed last.
test("the legend names the graph's own folder first, and neighbours apart", async () => {
  pinLegend();
  await mountWithGraphs([{ path: "/notes", id: "notes", name: "Who links whom", entries: 2 }], {
    ...graphFixture,
    path: "/notes",
    nodes: [
      { path: "/notes/a.md", label: "A" },
      { path: "/notes/b.md", label: "B" },
      { path: "/index.md", label: "Index", neighbour: true },
    ],
    edges: [
      { from: "/notes/a.md", to: "/notes/b.md", via: ["body"], count: 1 },
      { from: "/index.md", to: "/notes/a.md", via: ["body"], count: 1 },
    ],
  });
  await act(async () => navigateTo("/graph/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const rows = [...document.querySelectorAll("[role='group'][aria-label='Groups'] [data-legend-row] > button:first-child")].map(
    (b) => b.textContent,
  );
  // "Notes" is /notes itself — the folder's own readable name — not "Other".
  expect(rows).toEqual(["Notes", "Neighbours"]);
  const neighboursDot = legendRow("Neighbours").querySelector("span[aria-hidden]")!;
  expect(neighboursDot.className).toContain("border-dashed"); // hollow, as on the canvas

  // The hover card uses the same names.
  await pointAt("/index.md");
  const card = [...document.querySelectorAll("main div[aria-hidden]")].find((n) => n.textContent?.includes("Click to preview"));
  expect(card?.textContent).toContain("Neighbours ·");
});

// The whole row picks up, not only its grip — and a press that does not move
// is still a click, so the row's link still opens the entry.
test("a saved row drags by its body, and a still press still opens it", async () => {
  localStorage.setItem(`wiki:${bundle.id}:queue`, JSON.stringify(["/notes/a.md", "/notes/b.md", "/notes/checks.md"]));
  await mountAt("/read-later");
  const rows = () => [...document.querySelectorAll<HTMLElement>("main li")];
  const order = () => rows().map((li) => li.querySelector("a span.font-medium")?.textContent);
  expect(order()).toEqual(["A Note", "B", "Checks"]);

  // Pick up "Checks" by its title and drop it on the first row.
  await dragTo(rows()[2]!.querySelector("a")!, () => rows()[0]!);
  expect(order()).toEqual(["Checks", "A Note", "B"]);

  // A press on a title with no movement, then its click, is a click. (The
  // press is what clears the drag's "swallow the next click" flag, as it does
  // in a browser, where every click starts with one.)
  const title = rows()[1]!.querySelector<HTMLElement>("a")!;
  await act(async () => void title.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse", clientX: 5, clientY: 5 })));
  await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", clientX: 5, clientY: 5 })));
  await act(async () => title.click());
  expect(here).toBe("/wiki/notes/a.md");
});

// The legend stays out of the way until you reach for it: folded to its dots,
// open while pointed at, and kept open by its pin.
test("the groups legend folds until pointed at, and its pin keeps it open", async () => {
  await mountWithGraphs([{ path: "/", id: "all", name: "Everything", entries: 3 }], {
    ...graphFixture,
    id: "all",
    path: "/",
    nodes: [
      { path: "/index.md", label: "Index" },
      { path: "/notes/a.md", label: "A" },
    ],
    edges: [{ from: "/index.md", to: "/notes/a.md", via: ["body"], count: 1 }],
  });
  await act(async () => navigateTo("/graph/all"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const legend = () => document.querySelector<HTMLElement>("[role='group'][aria-label='Groups']")!;
  const rows = () => legend().querySelectorAll("[data-legend-row]").length;
  const header = () => legend().firstElementChild as HTMLElement;
  const dots = () => [...header().querySelectorAll("span[aria-hidden] > span")];
  const pin = () => legend().querySelector<HTMLElement>("button[aria-label='Keep the groups open'], button[aria-label='Let the groups fold']");
  const showAll = () => [...legend().querySelectorAll("button")].find((b) => b.textContent === "show all");
  const point = (on: boolean) =>
    act(async () => {
      legend().dispatchEvent(new PointerEvent(on ? "pointerover" : "pointerout", { bubbles: true }));
      legend().dispatchEvent(new PointerEvent(on ? "pointerenter" : "pointerleave"));
    });
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 250)));

  // Folded: no rows and no pin, but a dot per group, so the colours still say
  // something.
  expect(rows()).toBe(0);
  expect(dots().length).toBe(2);
  expect(pin()).toBeNull();

  // Pointed at, it opens, with its pin; left, it folds again after a beat.
  await point(true);
  expect(rows()).toBe(2);
  expect(pin()?.getAttribute("aria-pressed")).toBe("false");
  expect(showAll()).toBeUndefined(); // nothing hidden, nothing to bring back
  await act(async () => [...legend().querySelectorAll<HTMLElement>("[data-legend-row] > button:first-child")][1]!.click()); // hide Notes
  // "show all" comes, before the pin: the pin keeps the header's last place.
  const buttons = [...header().querySelectorAll("button")];
  expect(buttons.map((b) => b.textContent || b.getAttribute("aria-label"))).toEqual(["show all", "Keep the groups open"]);
  await point(false);
  expect(rows()).toBe(2); // not yet: a pointer grazing the edge does not flicker it
  await settle();
  expect(rows()).toBe(0);
  // Folded, its dots are muted so the fold does not compete with the graph,
  // and the hidden group's is fainter still, which is how it says so.
  expect(dots().map((d) => d.className.match(/opacity-\d+/)?.[0])).toEqual(["opacity-45", "opacity-15"]);
  // Kept to the right, clear of the label.
  expect(dots()[0]!.parentElement!.className).toContain("justify-end-safe");

  // The pin keeps it open, and that is remembered.
  await point(true);
  await act(async () => pin()!.click());
  expect(pin()?.getAttribute("aria-pressed")).toBe("true");
  await point(false);
  await settle();
  expect(rows()).toBe(2);
  await act(async () => navigateTo("/wiki/index.md"));
  await act(async () => navigateTo("/graph/all"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(rows()).toBe(2);

  // Unpinned, it stays open while still pointed at, and folds once the
  // pointer leaves.
  await point(true);
  await act(async () => pin()!.click());
  expect(pin()?.getAttribute("aria-pressed")).toBe("false");
  expect(rows()).toBe(2);
  await point(false);
  await settle();
  expect(rows()).toBe(0);
});

// Folded, there are no buttons in it to tab to, so the legend itself is.
test("the groups legend opens from the keyboard", async () => {
  await mountWithGraphs([{ path: "/", id: "all", name: "Everything", entries: 3 }], {
    ...graphFixture,
    id: "all",
    path: "/",
    nodes: [
      { path: "/index.md", label: "Index" },
      { path: "/notes/a.md", label: "A" },
    ],
    edges: [],
  });
  await act(async () => navigateTo("/graph/all"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const legend = () => document.querySelector<HTMLElement>("[role='group'][aria-label='Groups']")!;
  expect(legend().tabIndex).toBe(0);
  await act(async () => legend().focus());
  expect(legend().querySelectorAll("[data-legend-row]").length).toBe(2);
  expect(legend().tabIndex).toBe(-1); // open, its own buttons are the stops
});

/** Rests the pointer on a folded properties line long enough to open it. */
async function peekProperties(toggle: HTMLElement) {
  await act(async () => toggle.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await act(async () => toggle.closest("div.relative")!.dispatchEvent(new PointerEvent("pointerenter")));
  await act(async () => new Promise((r) => setTimeout(r, 150)));
}

test("resting on folded properties floats them over the text, and a click pins them", async () => {
  await mountAt("/wiki/notes/a.md");
  const area = () => propertiesToggle()!.closest("div.relative") as HTMLElement;
  const floating = () => area().querySelector(":scope > .absolute dl");
  const inFlow = () => area().querySelector(":scope > .bg-panel-2 dl");
  const leave = () =>
    act(async () => {
      propertiesToggle()!.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
      area().dispatchEvent(new PointerEvent("pointerleave"));
    });

  // Passing over: the pointer leaves before the rest is up, and nothing opens.
  await act(async () => propertiesToggle()!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await act(async () => area().dispatchEvent(new PointerEvent("pointerenter")));
  await act(async () => new Promise((r) => setTimeout(r, 40)));
  expect(floating()).toBeNull();
  await leave();
  await act(async () => new Promise((r) => setTimeout(r, 150)));
  expect(floating()).toBeNull();

  // Resting: it opens, over the text rather than pushing it down.
  await peekProperties(propertiesToggle()!);
  expect(floating()).not.toBeNull();
  expect(inFlow()).toBeNull();
  expect(floating()!.querySelector("a")?.getAttribute("href")).toBe("/wiki/notes/b.md");

  // Leaving: gone almost at once, after a 30ms beat.
  await leave();
  expect(floating()).not.toBeNull();
  await act(async () => new Promise((r) => setTimeout(r, 60)));
  expect(floating()).toBeNull();

  // Focus is never passing by, so it opens at once.
  await act(async () => propertiesToggle()!.focus());
  expect(floating()).not.toBeNull();
  await act(async () => propertiesToggle()!.blur());

  // A click keeps it open, in the page: the float gives way to the grid in place.
  await act(async () => propertiesToggle()!.click());
  expect(inFlow()).not.toBeNull();
  expect(floating()).toBeNull();

  // Folding it again under the pointer folds it: no float where the grid was,
  // until the pointer has left and come back.
  await peekProperties(propertiesToggle()!);
  await act(async () => propertiesToggle()!.click());
  expect(inFlow()).toBeNull();
  expect(floating()).toBeNull();
  await peekProperties(propertiesToggle()!);
  expect(floating()).toBeNull();
  await leave();
  await peekProperties(propertiesToggle()!);
  expect(floating()).not.toBeNull();
});


// Every sheet folds the properties the way the page does, so the hand learns
// it once. A board's status and lane lead the line, and its controls work in
// the floating grid, without keeping it open.
test("every sheet folds the properties, and a board's controls work while they float", async () => {
  await openGraph("/graph/notes/notes/a.md");
  const toggle = () => document.querySelector<HTMLElement>("[role='dialog'] button[aria-controls='entry-properties']");
  expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelector("[role='dialog'] dl")).toBeNull();

  const restore = stubBoard();
  try {
    await mountAt("/kanban/notes/notes/a.md");
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    // Status and lane first: todo · high, then the rest.
    expect([...toggle()!.querySelectorAll(":scope > span > span[title]")].slice(0, 2).map((e) => e.textContent)).toEqual([
      "todo",
      "high",
    ]);

    await peekProperties(toggle()!);
    const writes = captureWrites();
    await act(async () => choice("status", "blocked").click());
    expect(writes[0]?.body).toEqual({ value: "blocked", lane: "", version: 1 });
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false"); // used, not kept
  } finally {
    restore();
  }
});

// A key with nothing after it is YAML's null. It says nothing, so it is left
// off the folded line, and the grid shows the key with "(nothing)", never the
// word "null" (found in a screenshot of a card: "todo · medium · null").
test("an empty property says nothing folded, and (nothing) in the grid", async () => {
  const saved = entry.frontmatter;
  entry.frontmatter = { ...saved, owner: null, note: "", aliases: [], tags: ["api", null] };
  try {
    await mountAt("/wiki/notes/a.md");
    const line = propertiesToggle()!.textContent ?? "";
    expect(line).not.toContain("null");
    expect(line).toContain("todo");
    expect(line).toContain("api");
    // Three fields shown (status, blockers, tags), so two separators: the empty
    // ones take no place on the line.
    const dots = [...propertiesToggle()!.querySelectorAll("span[aria-hidden]")].filter((s) => s.textContent === "·");
    expect(dots.length).toBe(2);

    await act(async () => propertiesToggle()!.click());
    const grid = document.querySelector("#entry-properties")!;
    const row = (key: string) => grid.querySelector(`dt[title='${key}']`)!.nextElementSibling!.textContent;
    expect(row("owner")).toBe("(nothing)");
    expect(row("note")).toBe("(nothing)");
    expect(row("aliases")).toBe("(nothing)");
    expect(row("tags")).toBe("api");
    expect(grid.textContent).not.toContain("null");
  } finally {
    entry.frontmatter = saved;
  }
});

// A folder's index stands for the folder, so on a graph it is a landmark: named
// whenever names are on at all, however poorly connected, and drawn as a ring
// rather than a dot. "None" still means none.
test("an index node is named unless names are off, and drawn as a ring", async () => {
  // Big enough that "hubs" leaves names out: everything is linked to two hubs,
  // and the index and one ordinary entry are linked to nothing.
  const leaves = Array.from({ length: 30 }, (_, i) => `/notes/n${i}.md`);
  await mountWithGraphs([{ path: "/", id: "all", name: "Everything", entries: 35 }], {
    ...graphFixture,
    id: "all",
    path: "/",
    nodes: [
      ...["/notes/hub.md", "/notes/hub2.md", "/notes/alone.md", ...leaves].map((path) => ({ path, label: path })),
      { path: "/notes/sub/index.md", label: "Sub" },
      // The folder's log: named like the index, drawn like any entry.
      { path: "/notes/sub/log.md", label: "Sub (log)" },
      // A neighbour that is an index stays drawn as a neighbour.
      { path: "/index.md", label: "My kb", neighbour: true },
    ],
    edges: leaves.flatMap((p) => [
      { from: p, to: "/notes/hub.md", via: ["body"], count: 1 },
      { from: p, to: "/notes/hub2.md", via: ["body"], count: 1 },
    ]),
  });
  await act(async () => navigateTo("/graph/all"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const mode = (label: string) =>
    act(async () => [...document.querySelectorAll<HTMLElement>("[role='radio']")].find((b) => b.textContent === label)!.click());

  // Hubs: the index is named, the equally unconnected entry is not.
  expect(document.querySelector("[role='radio'][aria-checked='true']")?.textContent).toBe("Hubs");
  expect(labelled()).toContain("/notes/sub/index.md");
  expect(labelled()).toContain("/notes/hub.md");
  expect(labelled()).toContain("/notes/sub/log.md");
  expect(labelled()).not.toContain("/notes/alone.md");

  await mode("All");
  expect(labelled()).toContain("/notes/sub/index.md");

  await mode("None");
  expect(labelled()).toEqual([]);

  // A ring in its group's colour, where an entry is a filled dot.
  const dot = (p: string) => document.querySelector<SVGCircleElement>(`main svg [data-path='${p}'] circle`)!;
  expect(dot("/notes/sub/index.md").getAttribute("data-index")).toBe("true");
  expect(dot("/notes/sub/index.md").getAttribute("class")).toContain("fill-bg");
  expect(dot("/notes/sub/index.md").style.stroke).not.toBe("");
  expect(dot("/notes/alone.md").getAttribute("data-index")).toBeNull();
  expect(dot("/notes/alone.md").style.fill).not.toBe("");
  expect(dot("/notes/sub/log.md").getAttribute("data-index")).toBeNull();
  expect(dot("/notes/sub/log.md").style.fill).not.toBe("");
  expect(dot("/index.md").getAttribute("data-index")).toBeNull();
  expect(dot("/index.md").getAttribute("stroke-dasharray")).toBe("2 2");
});

// The node open beside the graph keeps its neighbourhood lit, as pointing at it
// does, for as long as it is open: following a link in the sheet moves the
// highlight with it, and closing the sheet puts the graph back as it was.
test("with the highlight following the preview, the open node stays lit until the sheet closes", async () => {
  await openGraph();
  const opacity = (p: string) => Number(document.querySelector(`main svg [data-path='${p}']`)!.getAttribute("opacity"));
  const lit = () => document.querySelectorAll("main svg line[class~='stroke-fg/60']").length;
  const arrows = () => document.querySelectorAll("main svg line[marker-end]").length;
  // Off until asked for: opening a node lights nothing that pointing has not.
  expect(await followsPreview()).toBe(false);
  await act(async () => navigateTo("/graph/notes/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(opacity("/notes/d.md")).toBe(1);
  expect(lit()).toBe(0);
  await act(async () => navigateTo("/graph/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await setFollowsPreview(true);

  // Nothing open: nothing singled out.
  expect(opacity("/notes/d.md")).toBe(1);
  expect(lit()).toBe(0);

  // A links B and the front door, and D nothing.
  await act(async () => navigateTo("/graph/notes/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(opacity("/notes/a.md")).toBe(1);
  expect(opacity("/notes/b.md")).toBe(1);
  expect(opacity("/notes/d.md")).toBeLessThan(0.5);
  expect(lit()).toBe(2);
  expect(arrows()).toBe(2);
  // Named, as the hovered node's neighbours are, whatever the label mode.
  await act(async () => [...document.querySelectorAll<HTMLElement>("[role='radio']")].find((b) => b.textContent === "None")!.click());
  expect(labelled()).toEqual(expect.arrayContaining(["/notes/a.md", "/notes/b.md", "/index.md"]));
  expect(labelled()).not.toContain("/notes/d.md");

  // Pointing at another node takes over while you point, then hands back.
  await pointAt("/notes/d.md");
  expect(opacity("/notes/d.md")).toBe(1);
  expect(opacity("/notes/b.md")).toBeLessThan(0.5);
  const node = document.querySelector("main svg [data-path='/notes/d.md']")!;
  await act(async () => node.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
  await act(async () => node.dispatchEvent(new PointerEvent("pointerleave")));
  expect(opacity("/notes/b.md")).toBe(1);
  expect(opacity("/notes/d.md")).toBeLessThan(0.5);

  // Another entry opened in the sheet moves the highlight to it.
  await act(async () => navigateTo("/graph/notes/notes/d.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(opacity("/notes/d.md")).toBe(1);
  expect(opacity("/notes/a.md")).toBeLessThan(0.5);
  expect(lit()).toBe(0); // D has no edges to light

  // An entry the graph does not hold has no neighbourhood here: nothing dims.
  await act(async () => navigateTo("/graph/notes/notes/checks.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(opacity("/notes/a.md")).toBe(1);
  expect(opacity("/notes/d.md")).toBe(1);

  // Closed, the graph is as it was before anything was opened.
  await act(async () => navigateTo("/graph/notes"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  for (const p of ["/notes/a.md", "/notes/b.md", "/notes/d.md"]) expect(opacity(p)).toBe(1);
  expect(lit()).toBe(0);
});

// A preference, so it is kept: the next visit to a graph in this bundle starts
// the way the last one was left.
test("highlight follows preview is set in the graph's settings, and remembered", async () => {
  await openGraph();
  // Cancel undoes it, like any field in the dialog.
  await act(async () => openGraphSettings());
  await act(async () => graphDialog()!.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1]!.click());
  await act(async () => [...graphDialog()!.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click());
  expect(await followsPreview()).toBe(false);

  // Saved, it is this browser's: what goes to wiki.toml is the graph's settings
  // and nothing about how this browser draws it.
  const writes = await setFollowsPreview(true);
  expect(writes).toHaveLength(1);
  expect(Object.keys(writes[0]!.body).sort()).toEqual(["name", "neighbours", "where"]);
  await openGraph();
  expect(await followsPreview()).toBe(true);
  await act(async () => navigateTo("/graph/notes/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(Number(document.querySelector("main svg [data-path='/notes/d.md']")!.getAttribute("opacity"))).toBeLessThan(0.5);
});

/** Whether the graph's settings say the highlight follows the preview. */
async function followsPreview(): Promise<boolean> {
  await act(async () => openGraphSettings());
  const on = graphDialog()!.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1]!.checked;
  await act(async () => [...graphDialog()!.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click());
  return on;
}

/** Sets it the way a person does: in the graph's settings, then Save. */
async function setFollowsPreview(on: boolean) {
  await act(async () => openGraphSettings());
  const box = graphDialog()!.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1]!;
  if (box.checked !== on) await act(async () => box.click());
  const writes = captureWrites();
  await act(async () => submit(graphDialog()!));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(graphDialog()).toBeNull();
  return writes;
}

// What opens from the header — the git popover — has to land over a sheet open
// beside a board or graph. The popover's own z-index cannot do it: it is capped
// by the header's, so the header itself is what has to sit above the sheet.
test("the header is layered above the side sheet", async () => {
  await openGraph("/graph/notes/notes/a.md");
  const z = (el: Element | null) => Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec(el?.getAttribute("class") ?? "")?.[1]);
  const header = document.querySelector("header.h-13");
  const sheet = document.querySelector("[data-print='sheet']");
  expect(sheet).not.toBeNull();
  expect(z(header)).toBeGreaterThan(z(sheet));
});

/** Presses ⌘F (or Ctrl+F), reporting whether the app took it from the browser. */
function pressFind(init: KeyboardEventInit = { metaKey: true }): boolean {
  const e = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true, ...init });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(e);
  });
  return e.defaultPrevented;
}

// On a board or a graph the view's own search is the better find, so ⌘F goes
// there — and a second press, already in it, is the browser's find again.
test("⌘F or Ctrl+F goes to the board's filter, then back to the browser", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const filter = document.querySelector<HTMLInputElement>("input[aria-label='Filter cards']")!;

  expect(pressFind({ ctrlKey: true })).toBe(true);
  expect(document.activeElement).toBe(filter);
  expect(pressFind({ metaKey: true })).toBe(false);

  // Not every chord with an F in it: ⇧⌘F and ⌥⌘F are something else's.
  filter.blur();
  expect(pressFind({ metaKey: true, shiftKey: true })).toBe(false);
  expect(pressFind({ metaKey: true, altKey: true })).toBe(false);
  expect(pressFind({})).toBe(false);
  expect(document.activeElement).not.toBe(filter);
});

test("⌘F goes to the graph's highlight", async () => {
  await openGraph();
  expect(pressFind()).toBe(true);
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Highlight nodes");
});

// A box behind a dialog is not one to send focus to, and a field you are typing
// in keeps its keys.
test("⌘F leaves an open dialog, and another field, alone", async () => {
  await openGraph();
  await act(async () => openGraphSettings());
  expect(pressFind()).toBe(false);
  expect(graphDialog()!.contains(document.activeElement) || document.activeElement === document.body).toBe(true);
  await act(async () => [...graphDialog()!.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click());

  const other = document.createElement("textarea");
  document.body.append(other);
  other.focus();
  expect(pressFind()).toBe(false);
  other.remove();
});

// Where there is no view search — an entry — the browser's find is untouched.
test("⌘F is the browser's on a page with no search box", async () => {
  await mountAt("/wiki/notes/a.md");
  expect(pressFind()).toBe(false);
});
