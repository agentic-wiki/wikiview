import { expect, test } from "bun:test";
import type { TreeNode } from "@/api";
import {
  columnColour,
  groupColour,
  groupOf,
  groupsUnder,
  isShelved,
  laneBars,
  NEUTRAL,
  tagColour,
} from "@/colour";

function folder(path: string, children: TreeNode[] = []): TreeNode {
  return { path, name: path.split("/").pop() ?? "", entries: [], children };
}

// A bundle with three top-level folders, one of them with a subfolder.
const tree = folder("/", [
  folder("/guides", [folder("/guides/deep")]),
  folder("/plugins"),
  folder("/core"),
]);

test("groups are the root's child folders, coloured by position in tree order", () => {
  const groups = groupsUnder(tree, "/");
  expect(groups.map((g) => g.path)).toEqual(["/guides", "/plugins", "/core"]);
  expect(groups.map((g) => g.colour)).toEqual([
    "var(--color-cat-0)",
    "var(--color-cat-1)",
    "var(--color-cat-2)",
  ]);
});

test("an entry takes its first-level folder's group, however deep it is", () => {
  const groups = groupsUnder(tree, "/");
  expect(groupOf("/plugins/multisig.md", groups, "/")?.path).toBe("/plugins");
  // One level only: the subfolder is not a group of its own.
  expect(groupOf("/guides/deep/very/far.md", groups, "/")?.path).toBe("/guides");
});

test("an entry directly in the root, or outside it, has no group", () => {
  const groups = groupsUnder(tree, "/");
  expect(groupOf("/index.md", groups, "/")).toBeNull();
  expect(groupColour("/index.md", groups, "/")).toBe(NEUTRAL);

  // Under a graph over /guides, /guides/x.md sits directly in the view's
  // folder, and a neighbour elsewhere in the bundle is outside it.
  const under = groupsUnder(tree, "/guides");
  expect(under.map((g) => g.path)).toEqual(["/guides/deep"]);
  expect(groupOf("/guides/x.md", under, "/guides")).toBeNull();
  expect(groupOf("/guides/deep/y.md", under, "/guides")?.path).toBe("/guides/deep");
  expect(groupOf("/plugins/z.md", under, "/guides")).toBeNull();
});

test("a root that shares a prefix with a folder does not claim it", () => {
  // `/guides-old` starts with `/guides` as a string, and is not under it.
  const under = groupsUnder(tree, "/guides");
  expect(groupOf("/guides-old/deep/a.md", under, "/guides")).toBeNull();
});

test("a root the tree does not have has no groups, and says so neutrally", () => {
  expect(groupsUnder(tree, "/nowhere")).toEqual([]);
  // An entry path is not a folder, so it has no child folders either.
  expect(groupsUnder(folder("/", []), "/index.md")).toEqual([]);
});

test("the ninth group wraps round to the first colour", () => {
  const many = folder("/", Array.from({ length: 9 }, (_, i) => folder(`/f${i}`)));
  const groups = groupsUnder(many, "/");
  expect(groups[8]!.colour).toBe(groups[0]!.colour);
});

test("a tag is coloured by its position in the bundle's list, the same everywhere", () => {
  const tags = ["ui", "api", "server"];
  expect(tagColour("api", tags)).toBe("var(--color-cat-1)");
  expect(tagColour("api", tags)).toBe(tagColour("api", [...tags]));
  // Not in the list yet: a moment ahead of the refetch.
  expect(tagColour("brand-new", tags)).toBe(NEUTRAL);
});

test("four live columns land exactly on the four stops", () => {
  const cols = ["a", "b", "c", "d"];
  expect(cols.map((c) => columnColour(c, cols))).toEqual([
    "var(--color-stage-0)",
    "var(--color-stage-1)",
    "var(--color-stage-2)",
    "var(--color-stage-3)",
  ]);
});

test("whatever the count, the first live column is gray and the last is green", () => {
  for (const n of [2, 3, 5, 6, 9]) {
    const cols = Array.from({ length: n }, (_, i) => `c${i}`);
    expect(columnColour(cols[0]!, cols)).toBe("var(--color-stage-0)");
    expect(columnColour(cols[n - 1]!, cols)).toBe("var(--color-stage-3)");
  }
});

// Never a blend: between two stops a column takes the nearer one, because every
// mix of blue and amber reads as a colour the gradient does not have.
test("between stops a column snaps to the nearest one", () => {
  const stages = (n: number) => {
    const cols = Array.from({ length: n }, (_, i) => `c${i}`);
    return cols.map((c) => columnColour(c, cols).replace(/var\(--color-stage-(\d)\)/, "$1"));
  };
  expect(stages(2)).toEqual(["0", "3"]);
  expect(stages(3)).toEqual(["0", "2", "3"]);
  expect(stages(5)).toEqual(["0", "1", "2", "2", "3"]);
  expect(stages(7)).toEqual(["0", "1", "1", "2", "2", "3", "3"]);
  // Whatever the count, only the four stops ever appear.
  for (let n = 1; n <= 12; n++) {
    expect(stages(n).every((s) => ["0", "1", "2", "3"].includes(s))).toBe(true);
  }
});

test("shelved columns are gray and take no step in the gradient", () => {
  // This bundle's own board: three live columns and a shelf.
  const cols = ["todo", "in-progress", "done", "archived"];
  expect(columnColour("archived", cols)).toBe("var(--color-stage-0)");
  expect(columnColour("done", cols)).toBe("var(--color-stage-3)");
  // Three live columns, so the middle one snaps to amber.
  expect(columnColour("in-progress", cols)).toBe("var(--color-stage-2)");
  // Wherever the shelf sits, and whatever its case.
  expect(columnColour("done", ["Parked", "todo", "done"])).toBe("var(--color-stage-3)");
  expect(isShelved("ARCHIVED")).toBe(true);
  expect(isShelved("archive")).toBe(false);
});

test("one live column is blue, not the gray a shelf is drawn in", () => {
  expect(columnColour("todo", ["todo"])).toBe("var(--color-stage-1)");
  expect(columnColour("todo", ["todo", "archived"])).toBe("var(--color-stage-1)");
});

test("the no-status column, and a value the board does not have, are neutral", () => {
  expect(columnColour("", ["todo", ""])).toBe(NEUTRAL);
  expect(columnColour("ghost", ["todo", "done"])).toBe(NEUTRAL);
});

test("lane bars rank by position: first three, last one", () => {
  expect(laneBars(0, 1)).toBe(3);
  expect([0, 1].map((i) => laneBars(i, 2))).toEqual([3, 1]);
  expect([0, 1, 2].map((i) => laneBars(i, 3))).toEqual([3, 2, 1]);
  expect([0, 1, 2, 3, 4].map((i) => laneBars(i, 5))).toEqual([3, 3, 2, 2, 1]);
});

// Every colour this module hands out is a token the stylesheet must define, and
// define outside `@theme`. A misspelt name would pass every test above and
// paint nothing — and so would a correct one inside `@theme`, which Tailwind
// drops from the build unless something it scans spells the name out. These are
// only ever named at runtime, so the tree showed three folder colours of eight.
test("every token the module can emit is defined where the build keeps it", async () => {
  const source = await Bun.file(new URL("./index.css", import.meta.url)).text();
  // The `@theme` blocks, removed: what is left is what ships regardless.
  const css = source.replace(/@theme\s*\{[^}]*\}/g, "");
  const many = folder("/", Array.from({ length: 8 }, (_, i) => folder(`/f${i}`)));
  const cols = ["a", "b", "c", "d"];
  const emitted = [
    ...groupsUnder(many, "/").map((g) => g.colour),
    ...cols.map((c) => columnColour(c, cols)),
    NEUTRAL,
  ];
  const names = emitted.flatMap((c) => [...c.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]!));
  expect(names.length).toBeGreaterThan(12);
  expect(names.filter((n) => !css.includes(`--${n}:`))).toEqual([]);
});
