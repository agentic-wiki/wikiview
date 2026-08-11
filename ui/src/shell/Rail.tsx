import { useEffect, useRef, useState } from "react";

export type RailSection = "entries" | "boards" | "search";

const SECTIONS: { id: RailSection; label: string; icon: string }[] = [
  { id: "entries", label: "Entries", icon: "M4 4h10l4 4v12H4z M14 4v4h4" },
  { id: "boards", label: "Boards", icon: "M4 5h4v14H4z M10 5h4v9h-4z M16 5h4v6h-4z" },
  { id: "search", label: "Search", icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4.2-4.2" },
];

/** How long the pointer must rest before the rail begins to expand. */
const HOVER_INTENT_MS = 150;

/**
 * The rail: a narrow column of sections that widens to show its labels.
 *
 * Two timings that are easy to conflate. *Hover intent* is the delay before
 * expansion begins, so a cursor sweeping past does not flash it open; there is
 * no delay before collapsing, because leaving should feel immediate. The
 * *animation* is separate and runs in both directions — snapping shut is
 * jarring even when the decision to close was instant.
 *
 * It expands over the panel rather than pushing it, so nothing reflows and the
 * content beside it never jumps.
 *
 * Focus expands it as well as hover: hover has no keyboard or touch equivalent,
 * and without this those users get unlabelled icons. Every button carries its
 * label for assistive technology regardless, so nothing depends on the visual
 * expansion happening at all.
 */
export function Rail({
  active,
  onSelect,
}: {
  active: RailSection;
  onSelect: (s: RailSection) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const open = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setExpanded(true), HOVER_INTENT_MS);
  };
  const close = () => {
    clearTimeout(timer.current);
    setExpanded(false);
  };

  return (
    <nav
      aria-label="Sections"
      onFocus={() => setExpanded(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
      className={[
        "border-border bg-surface absolute inset-y-0 left-0 z-20 flex flex-col border-r p-2",
        "transition-[width] duration-200 ease-out",
        expanded ? "w-44 shadow-lg" : "w-14",
      ].join(" ")}
    >
      {/* Hover belongs to the icons, not to the rail. The rail runs the full
          height of the window, so a handler on it makes the whole empty column
          below the icons a trigger, and the labels slide out because the
          pointer travelled down the left edge of the screen. */}
      <div className="flex flex-col gap-1" onPointerEnter={open} onPointerLeave={close}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-label={s.label}
            aria-current={active === s.id ? "page" : undefined}
            onClick={() => {
              onSelect(s.id);
              close(); // collapses on selection, as well as on leave
            }}
            className={[
              "flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-left",
              active === s.id ? "bg-accent/12 text-accent" : "text-muted hover:text-fg hover:bg-fg/5",
            ].join(" ")}
          >
            <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d={s.icon} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span
              className={[
                "truncate text-sm transition-opacity duration-150",
                expanded ? "opacity-100" : "pointer-events-none opacity-0",
              ].join(" ")}
              aria-hidden
            >
              {s.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
