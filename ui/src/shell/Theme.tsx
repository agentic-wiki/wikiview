import { useEffect, useState } from "react";
import { Glyph, IconButton } from "@/ui/IconButton";

export type Theme = "light" | "dark" | "auto";

/**
 * Where the choice is stored.
 *
 * Not scoped by bundle, unlike view state: which theme someone reads in is a
 * property of the person and their screen, not of the folder they opened. Being
 * asked again per bundle would be an odd kind of memory.
 */
const KEY = "wiki:theme";

export function readTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : "auto";
}

/**
 * Applies a theme by stamping the root element.
 *
 * "auto" removes the attribute rather than resolving to a value, so the CSS
 * media query decides. Resolving it here would freeze the choice at load and
 * stop tracking the system if it changes while the tab is open — which it does,
 * on a schedule, on most machines.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const ORDER: Theme[] = ["auto", "light", "dark"];

const LABEL: Record<Theme, string> = {
  auto: "Match system",
  light: "Light",
  dark: "Dark",
};

/**
 * The theme, and the step to the next one: auto → light → dark.
 *
 * A hook the shell holds, so the header button and the palette's "Toggle
 * theme" are one state rather than two that agree only after a reload.
 */
export function useTheme(): { theme: Theme; next: Theme; cycle: () => void } {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  }, [theme]);

  const next = nextTheme(theme);
  return { theme, next, cycle: () => setTheme(nextTheme) };
}

function nextTheme(theme: Theme): Theme {
  return ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
}

/** What each theme is called on screen, for the button and the palette. */
export function themeLabel(theme: Theme): string {
  return LABEL[theme];
}

/**
 * The header's theme button.
 *
 * One button rather than three, because this is a setting people touch rarely
 * and a segmented control would take permanent header width for it. The icon
 * shows the current state and the label names the next one, so the cycle is
 * discoverable without being explained.
 */
export function ThemeToggle({ theme, next, onCycle }: { theme: Theme; next: Theme; onCycle: () => void }) {
  return (
    <IconButton
      onClick={onCycle}
      label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}`}
    >
      <Glyph>
        {theme === "light" && (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
        {theme === "dark" && <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
        {/* Match system: half light, half dark. */}
        {theme === "auto" && (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
          </>
        )}
      </Glyph>
    </IconButton>
  );
}
