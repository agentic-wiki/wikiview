import { Link } from "react-router";
import type { TreeNode } from "@/api";

/**
 * A folder with no index.md.
 *
 * The listing is generated here, in the UI. It must never write an index.md to
 * make the folder look tidier: creating files in someone's bundle because the
 * interface found it convenient is exactly what the format's neutral-engine
 * line rules out. Offering to create one is an explicit action, later.
 */
export function FolderView({ folder }: { folder: TreeNode }) {
  const empty = folder.entries.length === 0 && folder.children.length === 0;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-fg text-xl font-semibold">{folder.name || "/"}</h1>
      <p className="text-muted mt-1 text-sm">
        {empty ? "This folder is empty." : "No index.md here, so this is a listing."}
      </p>

      {!empty && (
        <ul className="border-border mt-6 divide-y rounded-lg border">
          {folder.children.map((c) => (
            <li key={c.path}>
              <Link to={"/wiki" + c.path + "/"} className="hover:bg-fg/5 flex items-center gap-3 p-3">
                <span className="text-muted" aria-hidden>▸</span>
                <span className="text-fg">{c.name}</span>
                <span className="text-muted ml-auto text-xs">folder</span>
              </Link>
            </li>
          ))}
          {folder.entries.map((e) => (
            <li key={e.path}>
              <Link to={"/wiki" + e.path} className="hover:bg-fg/5 flex items-center gap-3 p-3">
                <span className="text-fg truncate">{e.title || e.name}</span>
                {e.type && <span className="text-muted ml-auto text-xs">{e.type}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
