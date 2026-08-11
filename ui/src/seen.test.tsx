import { beforeEach, expect, test } from "bun:test";
import { createRoot } from "react-dom/client";
import { act, StrictMode } from "react";
import type { TreeNode } from "@/api";
import { useSeen } from "@/seen";

const BUNDLE = "bundle-a";

function treeAt(changed: Record<string, number>): TreeNode {
  const stub = (path: string, label: string) => ({
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    type: "note",
    label,
    changedAt: changed[path] ?? 1,
  });
  return {
    path: "/",
    name: "",
    entries: [stub("/index.md", "Index")],
    children: [
      {
        path: "/notes",
        name: "notes",
        label: "Notes",
        entries: [stub("/notes/a.md", "A"), stub("/notes/b.md", "B")],
        children: [],
      },
    ],
  };
}

/**
 * Captures what the hook returned on every render, so a test can read the value
 * before effects ran. That distinction is the point: a mark cleared by an effect
 * is a mark that was rendered first, and one rendered frame is enough to see.
 */
function mount(tree: TreeNode, current: string) {
  const renders: Set<string>[] = [];
  function Probe() {
    renders.push(useSeen(BUNDLE, tree, current).unseen);
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return {
    renders,
    run: async () => {
      await act(async () =>
        root.render(
          <StrictMode>
            <Probe />
          </StrictMode>,
        ),
      );
      await act(async () => root.unmount());
      container.remove();
      return renders;
    },
  };
}

beforeEach(() => localStorage.clear());

test("the entry being read is never in the set, not even on the first render", async () => {
  localStorage.setItem(
    `wiki:${BUNDLE}:seen`,
    JSON.stringify({ "/index.md": 1, "/notes/a.md": 1, "/notes/b.md": 1 }),
  );

  // Both entries moved. One of them is the entry on screen.
  const renders = await mount(
    treeAt({ "/notes/a.md": 2, "/notes/b.md": 2 }),
    "/notes/a.md",
  ).run();

  expect(renders.length).toBeGreaterThan(0);
  for (const [i, unseen] of renders.entries()) {
    expect({ render: i, has: unseen.has("/notes/a.md") }).toEqual({ render: i, has: false });
    expect({ render: i, has: unseen.has("/notes/b.md") }).toEqual({ render: i, has: true });
  }
});

test("first sight of a bundle marks nothing, whatever the versions say", async () => {
  const renders = await mount(treeAt({ "/notes/a.md": 9, "/notes/b.md": 9 }), "/index.md").run();
  for (const unseen of renders) expect([...unseen]).toEqual([]);
});
