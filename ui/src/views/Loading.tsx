import { useEffect, useState } from "react";

/**
 * A loading state that only appears if loading actually takes a moment.
 *
 * Against a local server a fetch is a few milliseconds, so showing an indicator
 * the instant a navigation starts means a flash on every single click — motion
 * that reads as jank rather than as feedback. Waiting a beat means fast
 * navigations show nothing at all, which is the honest answer: nothing was worth
 * reporting.
 *
 * The delay is not "hide the wait" — the content is genuinely blank underneath.
 * It is that an indicator visible for 4ms communicates nothing and costs a
 * flicker.
 */
const DELAY_MS = 150;

export function Loading() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="text-muted grid h-full place-items-center text-sm" role="status" aria-live="polite">
      Loading…
    </div>
  );
}
