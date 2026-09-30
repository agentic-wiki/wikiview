import { NARROW, useMedia } from "@/media";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Saying an action landed: "Saved to Read later", "Moved to Done", "Pulled 3
 * commits". One at a time, gone after a beat, a new one replacing the last —
 * no queue, no actions, no stacking. Something that needs a decision is a
 * dialog, not a toast.
 */
type Tone = "ok" | "danger";
type Toast = { message: string; tone: Tone; id: number };

const Ctx = createContext<((message: string, tone?: Tone) => void) | null>(null);

/** How long a toast stays: long enough to read a short sentence once. */
const SHOWN_MS = 2600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const next = useRef(0);
  // Above the tab bar on a narrow screen, which would otherwise cover it.
  const narrow = useMedia(NARROW);
  const show = useCallback((message: string, tone: Tone = "ok") => {
    setToast({ message, tone, id: ++next.current });
  }, []);

  // Timed per toast, so a new one restarts the clock rather than inheriting
  // what was left of the last one's.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          data-print="hide"
          className={[
            narrow ? "bottom-[78px]" : "bottom-6",
            "bg-fg text-bg shadow-float animate-wv-in fixed left-1/2 z-90 flex -translate-x-1/2 items-center gap-2.5 rounded-[11px] px-4 py-2.5 text-[13px] font-medium whitespace-nowrap",
          ].join(" ")}
        >
          <span
            aria-hidden
            className={["size-[7px] shrink-0 rounded-full", toast.tone === "ok" ? "bg-ok" : "bg-danger"].join(" ")}
          />
          {toast.message}
        </div>
      )}
    </Ctx.Provider>
  );
}

/** The one function a component needs: `toast("Saved")`, or with `"danger"`. */
export function useToast(): (message: string, tone?: Tone) => void {
  const show = useContext(Ctx);
  if (!show) throw new Error("useToast outside a ToastProvider");
  return show;
}
