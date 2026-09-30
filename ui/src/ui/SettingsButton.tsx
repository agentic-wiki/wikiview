/** A view's "Settings", with the reference's sliders glyph: the way into what
 *  the view is over, written to the bundle's wiki.toml. */
export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-line text-muted hover:border-line-2 hover:text-fg flex h-8 items-center gap-1.5 rounded-lg border px-3"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
        <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
        <circle cx="15" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
      Settings
    </button>
  );
}
