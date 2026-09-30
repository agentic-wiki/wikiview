import type { ReactNode } from "react";
import { Glyph } from "@/ui/IconButton";

export type RailSection = "entries" | "boards" | "graphs" | "changed" | "later";

/**
 * The sections, and what each icon is.
 *
 * Named for what they are for rather than for the state they hold: "Read later"
 * says why you would click it, where "Queued" describes the list's condition and
 * leaves you to infer the rest. The code underneath still calls it a queue,
 * because that is what the structure is — added to at one end, worked from the
 * other.
 *
 * Recently changed is a clock: what happened while you were elsewhere. Read later
 * is a bookmark, the same glyph the tree marks a saved entry with, so one shape
 * means one thing wherever it appears. The glyphs are the reference's.
 */
const SECTIONS: { id: RailSection; label: string; short: string; icon: ReactNode }[] = [
  {
    id: "entries",
    label: "Entries",
    short: "Entries",
    icon: (
      <>
        <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
        <path d="M14 2.5V8h5.5" />
      </>
    ),
  },
  {
    id: "boards",
    label: "Boards",
    short: "Boards",
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 7.5v8M12 7.5v4.5M16 7.5v6" />
      </>
    ),
  },
  {
    id: "graphs",
    label: "Graphs",
    short: "Graphs",
    // Three entries and the links between them.
    icon: (
      <>
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="18" cy="7" r="2.4" />
        <circle cx="12" cy="18" r="2.4" />
        <path d="M7.2 8.2l3.7 7.6M16.8 9.2l-3.8 6.8M8.4 6.3l7.2.5" />
      </>
    ),
  },
  {
    id: "changed",
    label: "Recently changed",
    short: "Changed",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.2 2" />
      </>
    ),
  },
  {
    id: "later",
    label: "Read later",
    short: "Later",
    icon: <path d="M18.5 21l-6.5-4-6.5 4V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2z" />,
  },
];

/**
 * The rail: a narrow column of sections, one always active.
 *
 * Icons and tooltips rather than a column that widens to show its labels: the
 * labels were the only reason to widen, and a tooltip says the same word without
 * moving anything. Screen readers get every label from aria-label.
 *
 * The active section is its tint and its ink, as in the reference. The edge bar
 * this used to carry said the same thing a second time.
 *
 * Two sections carry a count: what changed since you looked, and what you saved
 * to read. Both are lists you go to, and the number is the reason to.
 */
export function Rail({
  active,
  onSelect,
  counts,
}: {
  active: RailSection;
  onSelect: (s: RailSection) => void;
  counts: Partial<Record<RailSection, number>>;
}) {
  return (
    <nav
      data-print="hide"
      aria-label="Sections"
      className="border-line bg-panel flex w-14 shrink-0 flex-col items-center gap-1 border-r py-2.5"
    >
      {SECTIONS.map((s) => {
        const count = counts[s.id] ?? 0;
        return (
          <button
            key={s.id}
            type="button"
            title={s.label}
            // The count is part of the name, so a screen reader hears "Read
            // later, 3" rather than a number with no subject.
            aria-label={count > 0 ? `${s.label}, ${count}` : s.label}
            aria-current={active === s.id ? "page" : undefined}
            onClick={() => onSelect(s.id)}
            className={[
              "relative grid size-10 shrink-0 place-items-center rounded-[10px]",
              active === s.id ? "bg-accent-bg text-accent-ink" : "text-muted hover:text-fg",
            ].join(" ")}
          >
            <Glyph size={19} className="[stroke-width:1.7]">
              {s.icon}
            </Glyph>
            {count > 0 && (
              <span
                aria-hidden
                className="bg-accent text-on-accent absolute top-1 right-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[9.5px] font-bold"
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The rail on a narrow screen: the same sections along the bottom, each with a
 * word under its glyph, since a phone has no pointer to hover for a tooltip.
 */
export function TabBar({ active, onSelect }: { active: RailSection; onSelect: (s: RailSection) => void }) {
  return (
    <nav
      data-print="hide"
      aria-label="Sections"
      className="border-line bg-panel grid h-15.5 shrink-0 grid-cols-5 border-t pb-[env(safe-area-inset-bottom)]"
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
            "flex flex-col items-center justify-center gap-1 text-[10.5px]",
            active === s.id ? "text-accent-ink" : "text-muted",
          ].join(" ")}
        >
          <Glyph size={20} className="[stroke-width:1.7]">
            {s.icon}
          </Glyph>
          <span>{s.short}</span>
        </button>
      ))}
    </nav>
  );
}
