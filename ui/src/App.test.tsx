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
  headings: [{ level: 1, text: "A Note", id: "a-note", line: 1 }],
  checkboxes: [],
};

function stubFetch() {
  const body = (v: unknown) =>
    Promise.resolve(new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } }));
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/bundle")) return body(bundle);
    if (url.endsWith("/api/tree")) return body(tree);
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
  expect(text).toContain("No index.md here");
  expect(text).toContain("A Note");
});
