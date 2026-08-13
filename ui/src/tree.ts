import type { EntryStub, TreeNode } from "@/api";

/**
 * The folder or entry at a bundle path.
 *
 * One walk for both, because a caller holding a path does not know which it
 * names: a breadcrumb segment and a route are each sometimes a folder and
 * sometimes a file. Two walks would be two chances to disagree with the tree.
 *
 * What to *call* the thing found stays with the caller. Navigation shows
 * `label`, the filename made readable; a page shows what an entry calls itself.
 */
export function find(root: TreeNode, path: string): TreeNode | EntryStub | undefined {
  const target = path.replace(/\/$/, "") || "/";
  if (root.path === target) return root;
  for (const e of root.entries) if (e.path === target) return e;
  for (const c of root.children) {
    const found = find(c, target);
    if (found) return found;
  }
  return undefined;
}

/**
 * What to call the thing at a bundle path when the question is *what to read*
 * rather than *where to navigate*.
 *
 * The tree, the breadcrumb and a folder listing name the file, because you are
 * moving around a folder of files and a row that renamed itself is a row you
 * cannot find your way back through. A page, a tab and a list of things to read
 * name what the entry calls itself.
 *
 * Three answers, in order:
 *
 * 1. The entry's own title, when it has one.
 * 2. Its folder, for an `index.md`, because "Index" says nothing in a list of
 *    rows with no folder drawn around them — and every folder's front door
 *    reads the same. Not a new rule: the server names a backlink this way, in
 *    these words, for this reason (`backlinkName`, internal/server/entry.go).
 *    The tree keeps calling it "Index", where the folder it sits in is right
 *    there on screen.
 * 3. The filename made readable, which is what everything else has.
 */
export function nameOf(root: TreeNode, path: string, rootLabel: string): string | undefined {
  const node = find(root, path);
  if (!node) return undefined;
  const own = "title" in node ? node.title : undefined;
  if (own) return own;
  if (isIndex(path)) return `${folderOf(root, path)?.label ?? rootLabel} (index)`;
  return node.label;
}

/** Whether a path is a folder's front door, root's included. */
export function isIndex(path: string): boolean {
  return path.endsWith("/index.md");
}

/**
 * How to name a bundle path in a list, and where to say it lives.
 *
 * One answer for both lists rather than each assembling its own, since "which
 * folder is this in" and "is the name already saying so" are the same two
 * decisions in both.
 */
export function describe(
  root: TreeNode,
  path: string,
  rootLabel: string,
): { name: string; where?: string; missing: boolean } {
  const name = nameOf(root, path, rootLabel);
  return {
    // The bare filename when the bundle no longer has this path: it is all that
    // is left of it, and it is better than an empty row.
    name: name ?? path.split("/").pop()!,
    // Omitted when the name is already the folder's: "3 Reader (index)" over
    // "3 Reader" is the same word twice.
    where: name === undefined || isIndex(path) ? undefined : folderOf(root, path)?.label ?? rootLabel,
    missing: name === undefined,
  };
}

/**
 * The folder an entry sits in, so a list can say where something lives with a
 * readable name rather than a raw path. Undefined for an entry in the bundle
 * root, which has no name of its own: the bundle's name is what it is called.
 */
export function folderOf(root: TreeNode, path: string): TreeNode | undefined {
  if (root.entries.some((e) => e.path === path)) return root.label === undefined ? undefined : root;
  for (const c of root.children) {
    const found = folderOf(c, path);
    if (found) return found;
  }
  return undefined;
}
