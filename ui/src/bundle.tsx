import { createContext, useContext, type ReactNode } from "react";
import type { BundleInfo, TreeNode } from "@/api";

/**
 * The bundle and its tree, for the components that draw *where* something is:
 * a group chip, a link's colour, a tag's colour, a readable name for a path.
 *
 * A context rather than props because those components sit at every depth —
 * inside an entry, inside a card on a board, inside a node's peek on a graph —
 * and threading two props through each view that might contain one is the
 * plumbing that makes the next such component a chore. It holds data the app
 * already fetched, and nothing that changes per view.
 */
const Ctx = createContext<{ bundle: BundleInfo; tree: TreeNode } | null>(null);

export function BundleProvider({
  bundle,
  tree,
  children,
}: {
  bundle: BundleInfo;
  tree: TreeNode;
  children: ReactNode;
}) {
  return <Ctx.Provider value={{ bundle, tree }}>{children}</Ctx.Provider>;
}

export function useBundle(): { bundle: BundleInfo; tree: TreeNode } {
  const value = useContext(Ctx);
  if (!value) throw new Error("useBundle outside a BundleProvider");
  return value;
}
