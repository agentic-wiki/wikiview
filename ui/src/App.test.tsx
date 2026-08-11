import { afterEach, expect, test } from "bun:test";
import { createRoot, type Root } from "react-dom/client";
import { StrictMode, act } from "react";
import { MemoryRouter } from "react-router";
import { App } from "@/App";
import type { BundleInfo, Entry, TreeNode } from "@/api";

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
  dir: "/tmp/my-kb",
  spec: "0.1",
  entries: 3,
  tools: ["wikiview"],
  version: 1,
};

const tree: TreeNode = {
  path: "/",
  name: "",
  index: "/index.md",
  entries: [{ path: "/index.md", name: "index.md", type: "", title: "Index" }],
  children: [
    {
      path: "/notes",
      name: "notes",
      entries: [
        { path: "/notes/a.md", name: "a.md", type: "note", title: "A Note" },
        { path: "/notes/b.md", name: "b.md", type: "note", title: "B" },
      ],
      children: [],
    },
  ],
};

const entry: Entry = {
  path: "/notes/a.md",
  title: "A Note",
  type: "note",
  frontmatter: { title: "A Note", status: "todo", blockers: ["/notes/b.md"] },
  body: "# A Note\n\nThe body of the entry. See [b](./b.md) and [readme](../README.md).\n",
  links: [
    { raw: "./b.md", to: "/notes/b.md", anchor: "", text: "b", line: 3, exists: true, outside: false },
    { raw: "../README.md", to: "", anchor: "", text: "readme", line: 4, exists: false, outside: true },
  ],
  frontmatterRefs: [{ key: "blockers", value: "/notes/b.md", to: "/notes/b.md", title: "Second Note" }],
  backlinks: [{ from: "/index.md", title: "The Front Door", text: "a note", line: 3 }],
  headings: [{ level: 1, text: "A Note", id: "a-note", line: 5, bodyLine: 1 }],
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

function stubFetch() {
  const body = (v: unknown) =>
    Promise.resolve(new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } }));
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/bundle")) return body(bundle);
    if (url.endsWith("/api/tree")) return body(tree);
    if (url.includes("/api/entry/notes/checks.md")) return body(checksEntry);
    if (url.includes("/api/entry/notes/named.md")) return body(namedInProse);
    if (url.includes("/api/entry/notes/differs.md")) return body(headingDiffers);
    // Only the entries the fixture actually declares. A catch-all here would
    // mean a "missing" entry still returned content, and the not-found path
    // would never be exercised.
    if (url.includes("/api/entry/notes/a.md") || url.includes("/api/entry/index.md")) {
      return body(entry);
    }
    return Promise.resolve(
      new Response(JSON.stringify({ error: "no entry at that path" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  // The app subscribes for the whole session; nothing here exercises the stream.
  globalThis.EventSource = class {
    addEventListener() {}
    removeEventListener() {}
    close() {}
  } as unknown as typeof EventSource;
}

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

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

  // The shell came up.
  expect(text).toContain("my-kb");
  // …and so did the entry the URL names. This is the assertion a status code
  // cannot make.
  expect(text).toContain("A Note");
  expect(text).toContain("The body of the entry.");
});

test("the tree renders the bundle's folders and entries", async () => {
  const text = await mountAt("/wiki/index.md");
  expect(text).toContain("notes");
  expect(text).toContain("A Note");
});

test("a folder with an index redirects to it rather than listing", async () => {
  // The root has an index.md, so navigating to the folder must land on the entry
  // — one entry, one URL.
  const text = await mountAt("/wiki/");
  expect(text).toContain("The body of the entry.");
});

test("a folder without an index lists its entries", async () => {
  // /notes has no index.md in the fixture, so the reader synthesizes a listing
  // rather than writing one into the bundle.
  const text = await mountAt("/wiki/notes/");
  expect(text).toContain("2 entries");
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
  expect(atRoot).not.toContain("A Note"); // /notes is collapsed

  await mountAt("/wiki/notes/a.md");
  const deep = [...document.querySelectorAll("aside a")].map((a) => a.textContent);
  expect(deep).toContain("A Note"); // its folder was opened for it
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
  expect(link?.textContent).toBe("Second Note");
  // A value with no counterpart in the table stays plain text.
  expect(strip.textContent).toContain("todo");
  expect(strip.querySelectorAll("a")).toHaveLength(1);
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
  const strip = kids.findIndex((n) => n.tagName === "DL");
  const heading = kids.findIndex((n) => n.tagName === "H1");
  expect(strip).toBeGreaterThanOrEqual(0);
  expect(heading).toBeGreaterThan(strip);
});
