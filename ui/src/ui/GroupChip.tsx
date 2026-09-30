import { useMemo } from "react";
import { useBundle } from "@/bundle";
import { groupOf, groupsUnder, NEUTRAL } from "@/colour";

/**
 * Which part of the bundle an entry is in: its group's colour and name, as a
 * pill. The bundle's own name for an entry directly in the root.
 */
export function GroupChip({ path }: { path: string }) {
  const { bundle, tree } = useBundle();
  const groups = useMemo(() => groupsUnder(tree, "/"), [tree]);
  const group = groupOf(path, groups, "/");
  return (
    <span
      title={group ? group.path : "The bundle's root"}
      className="border-line bg-panel-2 text-muted inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs"
    >
      <span className="size-[7px] rounded-full" style={{ background: group?.colour ?? NEUTRAL }} aria-hidden />
      {group?.label ?? bundle.label}
    </span>
  );
}
