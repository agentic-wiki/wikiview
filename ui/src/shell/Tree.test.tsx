import { expect, test } from "bun:test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router";
import type { TreeNode } from "@/api";
import { Tree } from "@/shell/Tree";

const stub = (path: string) => ({
  path,
  name: path.split("/").pop()!,
  type: "",
  label: path,
  changedAt: 1,
  links: 0,
});

// Three levels under the root, each holding an entry beside the next folder, so
// every level has both kinds of row to line up.
const tree: TreeNode = {
  path: "/",
  name: "",
  entries: [stub("/r.md")],
  children: [
    {
      path: "/a",
      name: "a",
      entries: [stub("/a/x.md")],
      children: [
        {
          path: "/a/b",
          name: "b",
          entries: [stub("/a/b/y.md")],
          children: [{ path: "/a/b/c", name: "c", entries: [stub("/a/b/c/z.md")], children: [] }],
        },
      ],
    },
  ],
};

/** Where each row's content starts, by what it shows. */
async function indents(): Promise<Record<string, number>> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  // Opened at the deepest entry, so the folders along its path are expanded.
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/wiki/a/b/c/z.md"]}>
        <Tree node={tree} bundleId="indent-test" unseen={new Set()} saved={new Set()} />
      </MemoryRouter>,
    ),
  );
  const out: Record<string, number> = {};
  for (const a of host.querySelectorAll<HTMLElement>("a[href^='/wiki/'][style]")) out[a.textContent!] = parseFloat(a.style.paddingLeft);
  for (const row of host.querySelectorAll<HTMLElement>("li > div[style]")) {
    out[row.querySelector("a")!.textContent!.replace(/\d+$/, "")] = parseFloat(row.style.paddingLeft);
  }
  act(() => root.unmount());
  host.remove();
  return out;
}

// Deeper reads as further right, at every level and not only the first: a
// subfolder's entries used to start 3px left of the entries above them.
test("each level of the tree is indented further than the one above", async () => {
  const at = await indents();
  expect(at["/r.md"]).toBe(12);
  expect(at["/a/x.md"]).toBe(46);
  expect(at["/a/b/y.md"]).toBe(58);
  expect(at["/a/b/c/z.md"]).toBe(70);
});

// Siblings line up whatever they are: a folder's name starts where the entries
// beside it do, its chevron hanging before it (15px past the padding, 8px gap).
test("a folder's name lines up with the entries beside it", async () => {
  const at = await indents();
  expect(at["a"]).toBe(8); // the top level, with its dot between chevron and name
  expect(at["b"]! + 23).toBe(at["/a/x.md"]!);
  expect(at["c"]! + 23).toBe(at["/a/b/y.md"]!);
});

// A folder with an index.md redirects its listing to it. Arriving there must not
// reopen the folder a click on its name just closed — it used to, so root
// folders (the ones that tend to have an index) flickered shut and open again.
test("clicking a folder's name closes it even when it redirects to its index", async () => {
  const indexed: TreeNode = {
    path: "/",
    name: "",
    entries: [],
    children: [
      {
        path: "/a",
        name: "a",
        index: "/a/index.md",
        entries: [stub("/a/index.md"), stub("/a/x.md")],
        children: [{ path: "/a/b", name: "b", entries: [stub("/a/b/y.md")], children: [] }],
      },
    ],
  };
  localStorage.clear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/wiki/r.md"]}>
        <Tree node={indexed} bundleId="index-test" unseen={new Set()} saved={new Set()} />
        <Routes>
          <Route path="/wiki/a/" element={<Navigate to="/wiki/a/index.md" replace />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  const chevron = () => host.querySelector<HTMLElement>("button[aria-label$=' a']")!;
  const name = () => host.querySelector<HTMLElement>("a[href='/wiki/a/']")!;

  await act(async () => name().click());
  expect(chevron().getAttribute("aria-expanded")).toBe("true");
  await act(async () => name().click());
  expect(chevron().getAttribute("aria-expanded")).toBe("false");

  act(() => root.unmount());
  host.remove();
});
