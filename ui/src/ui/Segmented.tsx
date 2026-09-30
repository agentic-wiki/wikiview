/**
 * A choice between a few ways of seeing the same thing — Name / Updated, Lanes /
 * Flat, Hubs / All / None — drawn as the reference's segmented track: a
 * `panel-2` groove, the chosen option raised on `elev`.
 *
 * Radio semantics, because that is what it is: one of several, always one.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What is being chosen, for a screen reader: "Sort by", "Labels". */
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-panel-2 border-line flex gap-0.5 rounded-[9px] border p-[3px]"
    >
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={[
            "h-6.5 rounded-md px-2.5 text-[12.5px] font-medium",
            value === id ? "bg-elev text-fg" : "text-muted hover:text-fg",
          ].join(" ")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
