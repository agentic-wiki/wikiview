import { useEffect, useState } from "react";

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
 * Cycles auto → light → dark.
 *
 * One button rather than three, because this is a setting people touch rarely
 * and a segmented control would take permanent header width for it. The icon
 * shows the current state and the tooltip names the next one, so the cycle is
 * discoverable without being explained.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  }, [theme]);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}`}
      title={`Theme: ${LABEL[theme]} — click for ${LABEL[next].toLowerCase()}`}
      className="text-muted hover:text-fg hover:bg-fg/5 grid size-8 shrink-0 place-items-center rounded-md transition-colors"
    >
      <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        {theme === "light" && (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
          </>
        )}
        {theme === "dark" && <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" strokeLinejoin="round" />}
        {theme === "auto" && (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
    </button>
  );
}
