import type { ReactNode } from "react";

/**
 * The reference's small capitals over a group of things: ENTRIES, BOARDS,
 * LINKS TO, ON THIS PAGE. One component rather than the recipe repeated,
 * because every one of them is the same decision — and `.caps` alone carries
 * only the letters, not the size and the ink (backlog/8-design/002).
 *
 * `count` sits at the far end in mono, when there is one.
 */
export function SectionLabel({
  children,
  count,
  className = "",
}: {
  children: ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <div className={`text-faint flex items-center gap-2 ${className}`}>
      <span className="caps flex-1 text-[11px] font-semibold">{children}</span>
      {count !== undefined && <span className="font-mono text-[11px]">{count}</span>}
    </div>
  );
}
