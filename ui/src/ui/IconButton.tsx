import type { ButtonHTMLAttributes, ReactNode } from "react";

/** The three sizes the reference uses: header (34px), page toolbar (32px),
 *  and a panel's own header (30px). */
const SIZE = { md: "size-8.5 rounded-lg", sm: "size-8 rounded-lg", xs: "size-7.5 rounded-[7px]" };

/**
 * A square, borderless button holding one glyph: the reference's commonest
 * control. `label` is both the accessible name and the tooltip, because an icon
 * with no words has to say what it does somewhere, and saying it twice
 * differently is how the two drift apart.
 */
export function IconButton({
  label,
  size = "md",
  className = "",
  children,
  ...rest
}: {
  label: string;
  size?: keyof typeof SIZE;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={[
        "text-muted hover:bg-fg/5 hover:text-fg relative grid shrink-0 place-items-center disabled:opacity-40",
        SIZE[size],
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** The stroke every glyph in the reference is drawn with. */
export function Glyph({
  size = 17,
  className = "",
  children,
}: {
  size?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}
