import { useMemo } from "react";
import { Link } from "react-router";
import type { EntryStub, TreeNode } from "@/api";
import { useBundle } from "@/bundle";
import { groupColour, groupsUnder, NEUTRAL } from "@/colour";
import { useBundleState } from "@/state";
import { age } from "@/time";
import { Segmented } from "@/ui/Segmented";
import { count } from "@/count";

type Sort = "name" | "updated";

/**
 * A folder with no index.md.
 *
 * The listing is generated here, in the UI. It must never write an index.md to
 * make the folder look tidier: creating files in someone's bundle because the
 * interface found it convenient is exactly what the format's neutral-engine
 * line rules out. It says so under the list, and says how to replace it.
 */
export function FolderView({ folder }: { folder: TreeNode }) {
  const { bundle, tree } = useBundle();
  const groups = useMemo(() => groupsUnder(tree, "/"), [tree]);
  // How you like a listing sorted is a view preference, kept per bundle.
  const [stored, setSort] = useBundleState<Sort>(bundle.id, "folder:sort", "name");
  const sort: Sort = stored === "updated" ? "updated" : "name";
  const entries = useMemo(() => sorted(folder.entries, sort), [folder.entries, sort]);
  const empty = folder.entries.length === 0 && folder.children.length === 0;
  // A folder at the top level is a group, and wears its colour; the root and
  // anything deeper are drawn in the colour of the group they sit in.
  const colour = folder.path === "/" ? NEUTRAL : groupColour(folder.path + "/", groups, "/");
  const title = folder.path === "/" ? bundle.label : (folder.label ?? folder.name);

  return (
    <div className="animate-wv-fade mx-auto max-w-[720px] px-12 pt-11 pb-24">
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <span className="border-line bg-panel-2 text-muted inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" aria-hidden>
            <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          Folder
        </span>
        <span className="text-faint font-mono text-xs">{folder.path === "/" ? "/" : folder.path + "/"}</span>
      </div>
      <h1 className="text-fg mb-2 text-[clamp(28px,4vw,38px)] leading-[1.12] font-bold tracking-[-0.03em]">
        {title}
      </h1>
      {/* The entry count is on the row above the list, beside the sort, so
          this line only says what that one does not. */}
      <p className="text-muted mb-6 text-base">
        {empty ? "Nothing here yet." : folder.children.length > 0 ? count(folder.children.length, "subfolder") : null}
      </p>

      {!empty && (
        <>
          <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
            <span className="text-faint text-[12.5px]">{count(folder.entries.length, "entry", "entries")}</span>
            <div className="flex-1" />
            <Segmented
              label="Sort by"
              options={[
                ["name", "Name"],
                ["updated", "Updated"],
              ]}
              value={sort}
              onChange={setSort}
            />
          </div>
          <ul className="border-line overflow-hidden rounded-xl border">
            {/* Subfolders first, in the tree's order whatever the sort: they
                have no single time of their own to sort by. */}
            {folder.children.map((c) => (
              <Row
                key={c.path}
                to={"/wiki" + c.path + "/"}
                colour={groupColour(c.path + "/", groups, "/")}
                folder
                title={c.label ?? c.name}
                aside={count(c.entries.length + c.children.length, "item")}
              />
            ))}
            {entries.map((e) => (
              <Row
                key={e.path}
                to={"/wiki" + e.path}
                colour={groupColour(e.path, groups, "/")}
                title={e.label}
                // A listing is navigation, so the row is the file. What the
                // entry calls itself sits underneath, when it says something
                // the filename does not.
                subtitle={e.title && e.title !== e.label ? e.title : undefined}
                links={e.links}
                aside={e.updated ? age(e.updated) : ""}
                asideTitle={e.updated}
              />
            ))}
          </ul>
        </>
      )}

      <p className="text-faint mt-3.5 text-[12.5px] leading-normal">
        No <span className="font-mono">index.md</span> here, so this listing is generated. Add{" "}
        <span className="font-mono">{folder.path === "/" ? "" : folder.path}/index.md</span> to replace it.
      </p>
    </div>
  );
}

/**
 * Entries in the order asked for. By name is the tree's order — the path,
 * which is the order the filenames encode. By updated is newest first, ties and
 * entries with no time kept in name order, so the list never shuffles between
 * two renders of the same data.
 */
function sorted(entries: EntryStub[], sort: Sort): EntryStub[] {
  if (sort === "name") return entries;
  return [...entries].sort(
    (a, b) => (b.updated ?? "").localeCompare(a.updated ?? "") || a.path.localeCompare(b.path),
  );
}

function Row({
  to,
  colour,
  title,
  subtitle,
  links,
  aside,
  asideTitle,
  folder = false,
}: {
  to: string;
  colour: string;
  title: string;
  subtitle?: string;
  links?: number;
  aside: string;
  asideTitle?: string;
  folder?: boolean;
}) {
  return (
    <li className="border-line border-b last:border-b-0">
      <Link
        to={to}
        className="hover:bg-fg/5 grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-3.5 px-4 py-3"
      >
        <span
          className={["size-2", folder ? "rounded-[2px]" : "rounded-full"].join(" ")}
          style={{ background: colour }}
          aria-hidden
        />
        <span className="min-w-0">
          <span className="text-fg block truncate font-medium">{title}</span>
          {subtitle && <span className="text-muted mt-0.5 block truncate text-[12.5px]">{subtitle}</span>}
        </span>
        <span className="text-faint flex items-center gap-1 font-mono text-[11px]" title={links === undefined ? undefined : count(links, "linked entry", "linked entries")}>
          {links !== undefined && (
            <>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
              </svg>
              {links}
            </>
          )}
        </span>
        <span className="text-faint min-w-18 text-right text-xs" title={asideTitle}>
          {aside}
        </span>
      </Link>
    </li>
  );
}
