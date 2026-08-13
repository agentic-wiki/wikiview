import type { TreeNode } from "@/api";
import { count, FileIcon, FolderIcon, Row } from "@/views/listing";

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
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-fg text-2xl font-semibold tracking-tight">{folder.name || "/"}</h1>
      <p className="text-muted mt-1 text-sm">
        {empty
          ? "Nothing here yet."
          : `${count(folder.children.length, "subfolder")} · ${count(folder.entries.length, "entry", "entries")}`}
      </p>

      {!empty && (
        <ul className="mt-6 space-y-1">
          {folder.children.map((c) => (
            <Row
              key={c.path}
              to={"/wiki" + c.path + "/"}
              icon={<FolderIcon />}
              title={c.label ?? c.name}
              meta={count(c.entries.length + c.children.length, "item")}
            />
          ))}
          {folder.entries.map((e) => (
            <Row
              key={e.path}
              to={"/wiki" + e.path}
              icon={<FileIcon />}
              title={e.label}
              // A listing is navigation, so the row is the file. What the entry
              // calls itself sits underneath, and only when it says something
              // the filename does not.
              subtitle={e.title && e.title !== e.label ? e.title : undefined}
              meta={e.type}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
