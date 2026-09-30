/**
 * The reference's small search box in a view's header: a magnifier and an
 * input on `panel-2`. A board filters with it, a graph highlights with it.
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
  return (
    <label className="border-line bg-panel-2 focus-within:border-accent flex h-8 w-50 items-center gap-2 rounded-lg border px-2.5">
      <svg viewBox="0 0 24 24" width="14" height="14" className="text-faint shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="placeholder:text-faint min-w-0 flex-1 bg-transparent text-[13px] outline-none"
      />
    </label>
  );
}
