import { useEffect, useState } from "react";
import { Glyph, IconButton } from "@/ui/IconButton";

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
 * The page width, and the way to change it. A hook, so the reader knows which
 * it is — a wide page gives its "On this page" column to the text.
 */
export function useWidth(): [Width, (width: Width) => void] {
  const [width, setWidth] = useState<Width>(readWidth);
  useEffect(() => {
    applyWidth(width);
    if (width === "wide") localStorage.setItem(KEY, "wide");
    else localStorage.removeItem(KEY);
  }, [width]);
  return [width, setWidth];
}

/**
 * Reading width or wide. The icon stretches with the state and the label
 * names the next one, so the pair is discoverable on the first hover.
 */
export function WidthToggle({ width, onChange }: { width: Width; onChange: (width: Width) => void }) {
  const wide = width === "wide";
  const label = wide ? "wide" : "normal";
  const other = wide ? "normal" : "wide";

  return (
    <IconButton
      label={`Page width: ${label}. Switch to ${other}`}
      size="sm"
      data-print="hide"
      onClick={() => onChange(wide ? "normal" : "wide")}
      aria-pressed={wide}
      active={wide}
    >
      {/* Arrows pointing out, the reference's glyph; lit when wide. */}
      <Glyph size={16}>
        <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />
      </Glyph>
    </IconButton>
  );
}
