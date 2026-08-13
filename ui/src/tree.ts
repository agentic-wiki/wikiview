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
