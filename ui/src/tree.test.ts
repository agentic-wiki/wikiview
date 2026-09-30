import { expect, test } from "bun:test";
import type { EntryStub, TreeNode } from "@/api";
import { frontDoor } from "@/tree";

function stub(path: string): EntryStub {
  const name = path.split("/").pop()!;
  return { path, name, type: "", label: name, changedAt: 0 };
}

function root(entries: string[], index?: string): TreeNode {
  return { path: "/", name: "", entries: entries.map(stub), children: [], index };
}

// Every way back to the reader lands here, so the order of the fallbacks is the
// contract: the format's front door, then the one every other tool honours,
// then a listing that writes nothing into the bundle.
test("the front door is index.md, then README.md, then the root listing", () => {
  expect(frontDoor(root(["/index.md", "/README.md"], "/index.md"))).toBe("/wiki/index.md");
  expect(frontDoor(root(["/README.md", "/notes.md"]))).toBe("/wiki/README.md");
  expect(frontDoor(root(["/notes.md"]))).toBe("/wiki/");
});

// Filenames are written however people write them, and GitHub finds a
// readme.md as readily as a README.md.
test("the README fallback ignores case, and only at the root", () => {
  expect(frontDoor(root(["/readme.md"]))).toBe("/wiki/readme.md");
  const nested: TreeNode = {
    ...root([]),
    children: [{ path: "/docs", name: "docs", entries: [stub("/docs/README.md")], children: [] }],
  };
  expect(frontDoor(nested)).toBe("/wiki/");
});
