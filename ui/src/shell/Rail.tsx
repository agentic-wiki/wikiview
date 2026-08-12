export type RailSection = "entries" | "boards" | "search";

const SECTIONS: { id: RailSection; label: string; icon: string }[] = [
  { id: "entries", label: "Entries", icon: "M4 4h10l4 4v12H4z M14 4v4h4" },
  { id: "boards", label: "Boards", icon: "M4 5h4v14H4z M10 5h4v9h-4z M16 5h4v6h-4z" },
  { id: "search", label: "Search", icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4.2-4.2" },
];

/**
 * The rail: a narrow column of sections, one always active.
 *
 * Icons and tooltips rather than a column that widens to show its labels. The
 * labels were the only reason to widen, and a tooltip says the same word
 * without moving anything: the panel beside it already appears and disappears,
 * and a rail sliding over that is a second animation for one word of text.
 *
 * It also removes a surprise. Expanding on focus was there so keyboard users
 * got the labels hover gives, but returning to the window refocuses whatever
 * had focus last — so alt-tabbing back to the app slid the rail open for no
 * reason. Screen readers still get every label, from aria-label rather than
 * from anything visual happening.
 */
export function Rail({
  active,
  onSelect,
}: {
  active: RailSection;
  onSelect: (s: RailSection) => void;
}) {
  return (
    <nav
      data-print="hide"
      aria-label="Sections"
      className="border-border bg-surface absolute inset-y-0 left-0 z-20 flex w-14 flex-col gap-1 border-r p-2"
    >
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          title={s.label}
          aria-label={s.label}
          aria-current={active === s.id ? "page" : undefined}
          onClick={() => onSelect(s.id)}
          className={[
            "grid h-10 shrink-0 place-items-center rounded-md",
            active === s.id ? "bg-accent/12 text-accent" : "text-muted hover:text-fg hover:bg-fg/5",
          ].join(" ")}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d={s.icon} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </nav>
  );
}
