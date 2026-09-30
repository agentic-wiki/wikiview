import type { ReactNode } from "react";

/**
 * A page with nothing to show yet, and why: loading, nothing at this address,
 * the bundle unreachable, a board with no cards. One shape for all of them — a
 * glyph on a tile, what happened, what it means, and the way on — so an empty
 * page is never a blank one, and never a different design each time.
 */
export function State({
  icon,
  tone = "neutral",
  title,
  detail,
  action,
  live = false,
  spinning = false,
}: {
  icon: ReactNode;
  /** `danger` for something that went wrong, rather than something not there. */
  tone?: "neutral" | "danger";
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  /** Announced as it appears, for a state that is transient: loading. */
  live?: boolean;
  /** The glyph turns, for a state that is waiting on something. */
  spinning?: boolean;
}) {
  return (
    <div
      className="animate-wv-fade mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center"
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
    >
      <span
        aria-hidden
        className={[
          "bg-panel-2 mb-4 grid size-10 place-items-center rounded-[10px]",
          tone === "danger" ? "text-danger" : "text-faint",
        ].join(" ")}
      >
        <svg className={spinning ? "animate-wv-spin" : undefined} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <div className="text-fg font-medium">{title}</div>
      {detail && <div className="text-muted mt-1.5 text-[13px] leading-relaxed break-words">{detail}</div>}
      {action && <div className="mt-6 w-full">{action}</div>}
    </div>
  );
}

/** The glyphs states are drawn with, so one kind of state is one picture. */
export const StateIcon = {
  file: (
    <>
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
      <path d="M14 2.5V8h5.5" />
    </>
  ),
  loading: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  offline: (
    <>
      <path d="M2 2l20 20" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.1-1.4M1.4 9a15 15 0 0 1 4.2-2.7M22.6 9a15 15 0 0 0-11.7-3.9" />
      <path d="M12 20h.01" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 7.5v8M12 7.5v4.5M16 7.5v6" />
    </>
  ),
  graph: (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="7" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M7.2 8.2l3.7 7.6M16.8 9.2l-3.8 6.8M8.4 6.3l7.2.5" />
    </>
  ),
};

/** The secondary button a state offers its way on with. */
export const stateButton =
  "border-line-2 text-fg hover:bg-fg/5 inline-flex h-8.5 items-center rounded-[9px] border px-3.5";
