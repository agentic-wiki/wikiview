export type RailSection = "entries" | "boards" | "changed" | "later";

/**
 * The sections, and what each icon is.
 *
 * Named for what they are for rather than for the state they hold: "Read later"
 * says why you would click it, where "Queued" describes the list's condition and
 * leaves you to infer the rest. The code underneath still calls it a queue,
 * because that is what the structure is — added to at one end, worked from the
 * other.
 *
 * No Search. It sat here as permanent chrome answering a click with an apology,
 * and beside three icons that work a gap is better than a promise nothing keeps.
 * It comes back when the feature does.
 *
 * Recently changed is a clock: what happened while you were elsewhere. Read later
 * is a bookmark, the same glyph the tree marks a saved entry with, so one shape
 * means one thing wherever it appears.
 */
const SECTIONS: { id: RailSection; label: string; icon: string }[] = [
  { id: "entries", label: "Entries", icon: "M4 4h10l4 4v12H4z M14 4v4h4" },
  { id: "boards", label: "Boards", icon: "M4 5h4v14H4z M10 5h4v9h-4z M16 5h4v6h-4z" },
  {
    id: "changed",
    label: "Recently changed",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3.5 2",
  },
  { id: "later", label: "Read later", icon: "M7 4h10v16l-5-4-5 4z" },
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
      className="border-border bg-surface elev-1 absolute inset-y-0 left-0 z-20 flex w-14 flex-col gap-1 border-r p-2"
    >
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          title={s.label}
          aria-label={s.label}
          aria-current={active === s.id ? "page" : undefined}
          onClick={() => onSelect(s.id)}
          // The bar at the rail's edge is what says "you are here"; the tint and
          // the accent icon only say "this one is different from the others".
          // A tint alone has to be read against its neighbours to mean anything,
          // and at a glance across a narrow column there is nothing to read it
          // against.
          className={[
            "relative grid h-10 shrink-0 place-items-center rounded-md",
            "before:absolute before:-left-2 before:top-1/2 before:h-5 before:w-[3px]",
            "before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:transition-opacity",
            active === s.id
              ? "bg-accent/12 text-accent before:opacity-100"
              : "text-muted hover:text-fg hover:bg-fg/5 before:opacity-0",
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
