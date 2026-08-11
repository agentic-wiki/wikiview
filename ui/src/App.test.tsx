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
  entries: [{ path: "/index.md", name: "index.md", type: "" }],
  children: [
    {
      path: "/notes",
      name: "notes",
      entries: [
        { path: "/notes/a.md", name: "a.md", type: "note", title: "A Note" },
        { path: "/notes/b.md", name: "b.md", type: "note" },
      ],
      children: [],
    },
  ],
};

const entry: Entry = {
  path: "/notes/a.md",
  type: "note",
  frontmatter: { title: "A Note" },
  body: "# A Note\n\nThe body of the entry.\n",
  links: [{ raw: "./b.md", to: "/notes/b.md", anchor: "", text: "b", line: 3, exists: true }],
  backlinks: [],
  headings: [{ level: 1, text: "A Note", id: "a-note", line: 5, bodyLine: 1 }],
  checkboxes: [],
};

/** An entry whose checkbox sits on line 6 — deliberately not the line a client
 *  could infer by counting rendered items, so the test proves the server-given
 *  line is what travels. */
const checksEntry: Entry = {
  path: "/notes/checks.md",
  type: "task",
  frontmatter: {},
  body: "Some prose first.\n\nAnd more.\n\n- [ ] the only checkbox\n",
  links: [],
  backlinks: [],
  headings: [],
  // File line 6, body line 5: the frontmatter offset is exactly what the two
  // coordinate systems exist to keep straight.
  checkboxes: [{ line: 6, bodyLine: 5, done: false, text: "the only checkbox" }],
};

function stubFetch() {
  const body = (v: unknown) =>
    Promise.resolve(new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } }));
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/bundle")) return body(bundle);
    if (url.endsWith("/api/tree")) return body(tree);
    if (url.includes("/api/entry/notes/checks.md")) return body(checksEntry);
    if (url.includes("/api/entry/")) return body(entry);
    return Promise.resolve(new Response("not found", { status: 404 }));
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
