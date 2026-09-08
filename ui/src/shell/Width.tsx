import { useEffect, useState } from "react";

export type Width = "normal" | "wide";

/**
 * Not scoped by bundle, for the same reason as the theme: how wide you want a
 * page is a property of the person and the screen, not the folder they opened.
 */
const KEY = "wiki:width";

export function readWidth(): Width {
  try {
    return localStorage.getItem(KEY) === "wide" ? "wide" : "normal";
  } catch {
    return "normal";
  }
}

/**
 * Stamps `data-width` on the root. Reading width is the absence of a stamp so
 * the stylesheet's default owns it, which is also what lets `index.html`
 * restore the stored choice before the first paint.
 */
export function applyWidth(width: Width) {
  const root = document.documentElement;
  if (width === "normal") root.removeAttribute("data-width");
  else root.setAttribute("data-width", "wide");
}

/**
 * Reading width or wide. The icon stretches with the state and the tooltip
 * names the next one, so the pair is discoverable on the first hover.
 */
export function WidthToggle() {
  const [width, setWidth] = useState<Width>(readWidth);
  const wide = width === "wide";

  useEffect(() => {
    applyWidth(width);
    if (width === "wide") localStorage.setItem(KEY, "wide");
    else localStorage.removeItem(KEY);
  }, [width]);

  const label = wide ? "wide" : "normal";
  const other = wide ? "normal" : "wide";

  return (
    <button
      type="button"
      data-print="hide"
      onClick={() => setWidth(wide ? "normal" : "wide")}
      aria-pressed={wide}
      aria-label={`Page width: ${label}. Switch to ${other}`}
      title={`Page width: ${label}`}
      className="text-muted hover:text-fg hover:bg-fg/5 float-right ml-3 rounded-md p-1.5"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {wide ? (
          <>
            <path d="M2.5 5v14M21.5 5v14" />
            <path d="M5 12h14" />
            <path d="M8 9 5 12l3 3M16 9l3 3-3 3" />
          </>
        ) : (
          <>
            <path d="M7 5v14M17 5v14" />
            <path d="M9.5 12h5" />
            <path d="M11.5 10 9.5 12l2 2M12.5 10l2 2-2 2" />
          </>
        )}
      </svg>
    </button>
  );
}
