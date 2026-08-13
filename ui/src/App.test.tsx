import { afterEach, beforeEach, expect, test } from "bun:test";
import { createRoot, type Root } from "react-dom/client";
import { StrictMode, act } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { App } from "@/App";
import { proposeMessage } from "@/shell/GitActions";
import type { BundleInfo, Entry, GitStatus, TreeNode } from "@/api";
import { forget } from "@/cache";

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
  version: 1,
  boards: [{ path: "/notes", id: "notes", name: "Notes", status: "status" }],
};

const tree: TreeNode = {
  path: "/",
  name: "",
  index: "/index.md",
  entries: [{ path: "/index.md", name: "index.md", type: "", label: "Index", changedAt: 1 }],
  children: [
    {
      path: "/notes",
      name: "notes",
      // Prefixed on disk, readable in the UI, so the two are distinguishable.
      label: "Notes",
      entries: [
        // Its title says something its filename does not, which is what keeps
        // "shows the label" and "shows the title" telling apart.
        { path: "/notes/a.md", name: "a.md", type: "note", label: "A", title: "A Note", changedAt: 1 },
        { path: "/notes/b.md", name: "b.md", type: "note", label: "B", changedAt: 1 },
        { path: "/notes/checks.md", name: "checks.md", type: "task", label: "Checks", changedAt: 1 },
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
    "The [contract](./contract.sol) and ![a diagram](./diagram.png).\nAnd [gone](./gone.md).\n",
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
  ],
  frontmatterRefs: [{ key: "blockers", value: "/notes/b.md", to: "/notes/b.md", label: "B" }],
  backlinks: [{ from: "/index.md", title: "The Front Door", text: "a note", line: 3 }],
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

let listeners: Record<string, (e: MessageEvent) => void> = {};

/** Delivers a version on the stream the app is subscribed to. */
function emitVersion(v: number) {
  listeners.version?.(new MessageEvent("version", { data: String(v) }));
}

let fetches = 0;
/** How many requests the app has made, so a test can assert that a redundant
 *  event caused none. */
function fetchCount() {
  return fetches;
}

function stubFetch() {
  fetches = 0;
  const body = (v: unknown) =>
    Promise.resolve(new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } }));
  globalThis.fetch = ((input: RequestInfo | URL) => {
    fetches++;
    const url = String(input);
    if (url.endsWith("/api/bundle")) return body(bundle);
    if (url.endsWith("/api/tree")) return body(tree);
    if (url.includes("/api/board/")) return body(boardFixture);
    if (url.includes("/api/entry/notes/checks.md")) return body(checksEntry);
    if (url.includes("/api/entry/notes/named.md")) return body(namedInProse);
    if (url.includes("/api/entry/notes/differs.md")) return body(headingDiffers);
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

// The bundle name is a link to the front door, with README.md as the fallback
// every other tool that opens this folder honours.
test("the bundle name points at index.md, or README.md, or the listing", async () => {
  await mountAt("/wiki/notes/a.md");
  const name = document.querySelector('nav[aria-label="Breadcrumb"] a');
  expect(name?.getAttribute("href")).toBe("/wiki/index.md");
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
  const text = await mountAt("/wiki/notes/a.md");
  expect(text).toContain("Backlinks");
  expect(text).toContain("The Front Door"); // the linking entry's own title
  expect(text).toContain("/index.md:3"); // and where in it
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

// The borrowed title sits where the body's own heading would, so an entry that
// has one and an entry that does not are laid out the same way.
test("a prepended title sits below the frontmatter strip, not above it", async () => {
  await mountAt("/wiki/notes/checks.md");
  const article = document.querySelector("article")!;
  const kids = [...article.children];
  // The strip is a plain block wrapping the chips, so the divider it carries
  // spans the column rather than stopping short of the floated print button.
  const strip = kids.findIndex((n) => n.tagName === "DL" || n.querySelector("dl") !== null);
  const heading = kids.findIndex((n) => n.tagName === "H1");
  expect(strip).toBeGreaterThanOrEqual(0);
  expect(heading).toBeGreaterThan(strip);
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

// The rule that makes an off-board link ordinary rather than something needing
// special treatment: on this board it opens a card, otherwise it leaves.
test("a link inside a card stays on the board only when its target is on it", async () => {
  await mountAt("/wiki/index.md");
  const restore = stubBoard();
  await act(async () => navigateTo("/kanban/notes/notes/a.md"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const links = [...document.querySelectorAll("[role=\"dialog\"] .markdown a")];
  // /notes/b.md is a card on this board, so following it swaps the sheet.
  const onBoard = links.find((a) => a.textContent === "b");
  expect(onBoard?.getAttribute("href")).toBe("/kanban/notes/notes/b.md");

  // /notes/gone.md is not, so it leaves for the reader.
  const offBoard = links.find((a) => a.textContent === "gone");
  expect(offBoard?.getAttribute("href")).toBe("/wiki/notes/gone.md");

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

/** A card by the name on its face, so an assertion names what a person sees. */
function cardIn(column: string, label: string): HTMLElement | undefined {
  return [...columnEl(column).querySelectorAll("a")].find(
    (a) => a.querySelector("span")?.textContent === label,
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
// see, and the hamburger was the only way back.
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

/** Clicks a rail icon by its label. */
function openSection(label: string) {
  const button = [...document.querySelectorAll("nav[aria-label='Sections'] button")].find(
    (b) => b.getAttribute("aria-label") === label,
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

// The empty state of a feature is the one moment somebody will read how it
// works, so it shows the form rather than a note about what to hand-write into
// wiki.toml.
test("with no boards declared the panel offers to make one", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const panel = document.querySelector("aside")!;
  expect(Boolean(panel.querySelector("form"))).toBe(true);
  // The folders that hold entries, and only those.
  const options = [...panel.querySelectorAll("option")].map((o) => o.getAttribute("value"));
  expect(options).toEqual(["/", "/notes"]);
  // The id is suggested from the name rather than left for you to invent.
  expect(panel.querySelector<HTMLInputElement>("input[aria-label='Board id']")?.value).toBe("my-kb");
});

// The board `root` matches nothing in a bundle of notes, and it used to render a
// blank page: the server sent `columns: null` and the view read a list it had
// been promised.
test("a board with nothing on it says why, and offers a way out", async () => {
  const empty = { path: "/", id: "root", name: "My kb", field: "status", declared: false, columns: [] };
  await mountWithNoBoards("/kanban/root", empty);

  const main = document.querySelector("main")!;
  expect(main.textContent).toContain("Nothing on this board");
  // The reason, which is not guessable from anything on screen.
  expect(main.textContent).toContain("type: task");
  expect(Boolean(main.querySelector("form"))).toBe(true);
});

// Declaring a board is a config write, and the only thing worth asserting is
// that it goes out as one and lands you on the board it made.
test("declaring a board writes it and opens it", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const writes = captureWrites();
  const panel = document.querySelector("aside")!;
  await act(async () => submit(panel));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // The id the form suggested is the id that gets written, and the folder and
  // name go with it.
  expect(writes).toEqual([{ url: "/api/board", body: { id: "my-kb", path: "/", name: "My kb" } }]);
  expect(here).toBe("/kanban/my-kb");
});

// The server owns which ids are valid and which are taken, so a refusal is shown
// rather than second-guessed here — and nothing navigates.
test("a refused board keeps you on the form and says why", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  captureWrites(422);
  const panel = document.querySelector("aside")!;
  await act(async () => submit(panel));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  expect(panel.textContent).toContain(refusal);
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
  within.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
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

  const add = [...panel.querySelectorAll("button")].find((b) => b.textContent?.includes("New board"))!;
  await act(async () => add.click());
  expect(Boolean(panel.querySelector("form"))).toBe(true);
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
  // The first of them: the filter has a row per condition, and they all offer
  // the same keys.
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

// `key=value` is a small language, but one nobody should have to be told: both
// halves are known, and a mistyped one empties the board rather than complaining.
test("the filter reads as rows, and a row can be removed", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => openSettings());

  const dialog = document.querySelector<HTMLElement>("[aria-label='Board settings']")!;
  const cells = (label: string) =>
    [...dialog.querySelectorAll<HTMLSelectElement | HTMLInputElement>(`[aria-label='${label}']`)].map(
      (s) => s.value,
    );

  // `!=` is read before `=`, which is the engine's own order: the other way
  // round, `priority!=low` would be the key `priority!` equal to `low`.
  expect(cells("Filter key")).toEqual(["type", "priority"]);
  expect(cells("Filter operator")).toEqual(["=", "!="]);
  expect(cells("Filter value")).toEqual(["task", "low"]);

  // A value is typed, not picked: a filter is often written before the entries
  // catch up, and a board you cannot describe until something matches it is a
  // board you cannot set up. What the key already holds is a suggestion.
  const boxes = [...dialog.querySelectorAll<HTMLInputElement>("[aria-label='Filter value']")];
  expect(boxes.map((b) => b.tagName)).toEqual(["INPUT", "INPUT"]);
  const suggestions = boxes.map((b) =>
    [...(document.getElementById(b.getAttribute("list")!)?.querySelectorAll("option") ?? [])].map(
      (o) => o.getAttribute("value"),
    ),
  );
  expect(suggestions[0]).toEqual(["note", "task"]);
  expect(suggestions[1]).toEqual(["high", "low"]);
  // Empty is a value — `status=` matches an entry with no status — which is the
  // one thing an empty box does not say for itself.
  expect(boxes[0]?.getAttribute("placeholder")).toBe("(nothing)");

  const writes = captureWrites();
  await act(async () => dialog.querySelector<HTMLElement>("[aria-label='Remove filter 1']")!.click());
  expect(cells("Filter key")).toEqual(["priority"]);

  await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // The rows round-trip back to the spelling they came from.
  expect(writes[0]?.body.where).toEqual(["priority!=low"]);
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
  // One editable row, and the other shown as it was written rather than as a key
  // with an empty value.
  expect([...dialog.querySelectorAll("[aria-label='Filter key']")].length).toBe(1);
  expect(dialog.querySelector("[title='Not a filter']")?.textContent).toBe("nonsense");

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
  expect(panel.className).toContain("w-64"); // the tree, open

  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  // Closed, because one board is not a list worth width — and got there without
  // a transition to watch.
  expect(panel.className).toContain("w-0");
  expect(panel.className).not.toContain("transition");

  // A toggle is something you did, so that one animates.
  await act(async () => openBoardsSection());
  expect(panel.className).toContain("w-64");
  expect(panel.className).toContain("transition");
});

// Each section remembers its own width. One shared flag meant switching section
// argued with what you last did to the panel you left.
test("the panel remembers what each section was doing", async () => {
  await mountAt("/kanban/notes");
  const panel = document.querySelector("aside")!;

  // Open the boards list, then go to the reader and back.
  await act(async () => openBoardsSection());
  expect(panel.className).toContain("w-64");
  await act(async () => openSection("Entries"));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(panel.className).toContain("w-64"); // the tree, which is open by default
  await act(async () => openSection("Entries")); // …and now closed
  expect(panel.className).toContain("w-0");

  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // Boards is still open, rather than inheriting what Entries was just told.
  expect(panel.className).toContain("w-64");
});

// A bundle with no boards has nowhere to navigate, so the click has to be worth
// making: the panel is where the first board gets declared.
test("with no boards the icon still opens the panel", async () => {
  await mountWithNoBoards("/wiki/index.md");
  await act(async () => openBoardsSection());
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const panel = document.querySelector("aside")!;
  expect(panel.className).toContain("w-64");
  expect(Boolean(panel.querySelector("form"))).toBe(true);
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
  expect(panel.className).toContain("w-64");

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
    expect(panel.className).toContain("w-64");
    expect(main.textContent).toContain("Where the bundle starts.");
  } finally {
    flags.IS_REACT_ACT_ENVIRONMENT = true;
  }

  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // And now both, together.
  expect(panel.className).toContain("w-0");
  expect(main.textContent).not.toContain("Where the bundle starts.");
});

// And the same the other way: the panel used to open beside the board before
// the reader arrived, so the kanban redrew inside the narrower width first.
test("the panel does not open until the reader arrives", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const panel = document.querySelector("aside")!;
  const main = document.querySelector("main")!;
  expect(panel.className).toContain("w-0"); // one board, so no list

  const flags = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  flags.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    openSection("Entries");
    await Promise.resolve();
    await Promise.resolve();
    expect(panel.className).toContain("w-0");
    expect(document.querySelectorAll("main section[aria-label]").length).toBeGreaterThan(0);
  } finally {
    flags.IS_REACT_ACT_ENVIRONMENT = true;
  }

  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(panel.className).toContain("w-64");
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
  return [...(list?.querySelectorAll("li") ?? [])].map((li) => li.querySelector("span")?.textContent);
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
  expect(hidden("[aria-label='Search entries and boards']")).toBe(true);

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
  expect(settings.getAttribute("data-print")).toBe("hide");
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
  expect(sheet!.querySelector("[aria-label='Close card']")?.getAttribute("data-print")).toBe("hide");
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

// The divider spans the column rather than stopping short of the print button.
// A flex container establishes its own formatting context and steps aside from a
// float; an ordinary block does not, so only its line boxes move and its border
// still crosses the full width. Merging these two back into one element is the
// regression, and it is invisible without a renderer.
test("the frontmatter divider is not shortened by the print button", async () => {
  await mountAt("/wiki/notes/a.md");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const chips = document.querySelector("article dl")!;
  const rule = chips.parentElement!;
  expect(rule.className).toContain("border-b");
  expect(rule.className).not.toContain("flex");
  expect(chips.className).toContain("flex");
  // And the button it has to cross under is the floated one.
  expect(document.querySelector("article [aria-label='Print this entry']")?.className).toContain(
    "float-right",
  );
});

// The bundle name, a column header and a lane header are the same typographic
// decision made in three places, so they share one rule rather than three
// sprinklings of `uppercase tracking-wide`.
test("capitals are set by one shared rule", async () => {
  await mountAt("/kanban/notes");
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  const caps = (el: Element | null | undefined) => el?.className.split(/\s+/).includes("caps");
  expect(caps(document.querySelector("nav[aria-label='Breadcrumb'] a"))).toBe(true);
  expect(caps(columnEl("todo").querySelector("h2"))).toBe(true);
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
function stubGit(status: Partial<GitStatus>, onAction?: (path: string, body: unknown) => Response) {
  const real = globalThis.fetch;
  const full: GitStatus = {
    repo: true,
    branch: "main",
    remote: "origin/main",
    ahead: 0,
    behind: 0,
    changes: [],
    outside: 0,
    ...status,
  };
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

  expect(Boolean(document.querySelector("[aria-label='Pull']"))).toBe(false);
  expect(Boolean(document.querySelector("[aria-label='Sync']"))).toBe(false);
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

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Sync']")!.click());
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Sync']")!;
  expect(dialog.textContent).toContain("notes/mine.md");
  expect(dialog.textContent).toContain("notes/by-an-agent.md");
  expect(dialog.textContent).toContain("2 files to commit, 1 commit to push");
  // Nothing has happened yet.
  expect(asked.length).toBe(0);

  const confirm = [...dialog.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Commit and push"),
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
          status: { repo: true, branch: "main", remote: "origin/main", ahead: 1, behind: 2, changes: [] },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        status: { repo: true, branch: "main", remote: "origin/main", ahead: 1, behind: 2, changes: [] },
        error: "the pull was undone and nothing changed: CONFLICT in notes/a.md",
        proposed: "wikiview/2026-08-12-1430",
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Pull']")!.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Pull']")!;
  // Opening the preview is what asks the remote; nothing fetches on its own.
  expect(asked.some((a) => a.path === "/api/git/fetch")).toBe(true);

  const pull = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Pull")!;
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

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Sync']")!.click());
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Sync']")!;
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

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Sync']")!.click());
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Sync']")!;
  const confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Push")!;
  expect(confirm.hasAttribute("disabled")).toBe(true);
  expect(dialog.textContent).toContain("Nothing to sync");
});

// A dialog whose work is finished has nothing left to say, so it says it and
// goes — rather than waiting to be dismissed by somebody who has already moved
// on.
test("a finished action closes itself", async () => {
  await mountAt("/wiki/index.md");
  stubGit({ ahead: 1, changes: [] });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Sync']")!.click());
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Sync']")!;
  await act(async () =>
    [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Push")!.click(),
  );
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  // It says so first, and is still there to be read.
  expect(document.querySelector("[role='dialog'][aria-label='Sync']")?.textContent).toContain("Done");

  await act(async () => new Promise((r) => setTimeout(r, 1400)));
  expect(Boolean(document.querySelector("[role='dialog'][aria-label='Sync']"))).toBe(false);
});

// The one success worth staying open for: the branch name is the whole point of
// a rescue, and dismissing would take away the only place it is written down.
test("a rescue stays on screen, because the branch name is the point", async () => {
  await mountAt("/wiki/index.md");
  stubGit({ behind: 1, ahead: 1 }, (path) => {
    if (path === "/api/git/pull") {
      return new Response(
        JSON.stringify({
          status: { repo: true, branch: "main", remote: "origin/main", ahead: 1, behind: 1, changes: [] },
          error: "the pull was undone and nothing changed",
          proposed: "wikiview/2026-08-12-1430",
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        status: { repo: true, branch: "main", remote: "origin/main", ahead: 1, behind: 1, changes: [] },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  await act(async () => emitVersion(98));
  await act(async () => emitVersion(99));
  await act(async () => new Promise((r) => setTimeout(r, 0)));

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Pull']")!.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Pull']")!;
  await act(async () =>
    [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Pull")!.click(),
  );
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () =>
    [...dialog.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Push to this branch"))!
      .click(),
  );
  await act(async () => new Promise((r) => setTimeout(r, 1400)));

  const still = document.querySelector("[role='dialog'][aria-label='Pull']");
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

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Sync']")!.click());
  const text = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Sync']")!.textContent!;
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

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Sync']")!.click());
  const text = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Sync']")!.textContent!;
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

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Sync']")!.click());
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Sync']")!;
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

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Pull']")!.click());
  const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Pull']")!;
  expect(dialog.textContent).toContain("Asking the remote what it has");
  expect(dialog.textContent).not.toContain("Pulling…");
  const confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Pull")!;
  expect(confirm.hasAttribute("disabled")).toBe(true);

  await act(async () => {
    release(
      new Response(JSON.stringify({ status: { repo: true, branch: "main", remote: "origin/main", ahead: 0, behind: 3, changes: [], outside: 0 } }), {
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

  await act(async () => document.querySelector<HTMLElement>("[aria-label='Sync']")!.click());
  const text = document.querySelector<HTMLElement>("[role='dialog'][aria-label='Sync']")!.textContent!;
  expect(text).not.toContain("elsewhere in this repository");
});
