import { useEffect, useRef } from "react";

/**
 * The reference's small search box in a view's header: a magnifier and an
 * input on `panel-2`. A board filters with it, a graph highlights with it.
 *
 * ⌘F / Ctrl+F comes here. On a board or a graph this box is the better find:
 * the browser's cannot see into a graph's drawing, and on a board it only
 * scrolls to a match where this narrows the columns to the matches. Pressed
 * again with this box already focused, it is the browser's again — the way to
 * search the text of an entry open beside the view.
 *
 * Left alone while you are typing somewhere else, or while a dialog or the
 * palette is open: the key belongs to what you are in, and a box behind a modal
 * is not one to send focus to.
 */
export function SearchField({
  label,
  placeholder,
  value,
  onChange,
}: {
  /** The accessible name, which says what typing here does. */
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f") return;
      const field = input.current;
      if (!field || document.activeElement === field) return;
      if (editing(document.activeElement) || document.querySelector("[aria-modal='true']")) return;
      e.preventDefault();
      field.focus();
      field.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label className="border-line bg-panel-2 focus-within:border-accent flex h-8 w-50 items-center gap-2 rounded-lg border px-2.5">
      <svg viewBox="0 0 24 24" width="14" height="14" className="text-faint shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        ref={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="placeholder:text-faint min-w-0 flex-1 bg-transparent text-[13px] outline-none"
      />
    </label>
  );
}

/** Whether an element takes typing, so a shortcut has no business there. */
function editing(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "reset"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}
