import { Link } from "react-router";
import { State, StateIcon, stateButton } from "@/ui/State";

/**
 * Shown when a URL names nothing.
 *
 * Two ways to arrive: a path outside the app's routes (`/README.md` rather than
 * `/wiki/README.md`), and a `/wiki/…` path naming an entry that is not in the
 * bundle. Both used to render an empty page, which reads as a broken app rather
 * than as a wrong address.
 *
 * A missing entry is deliberately not phrased as an error. The format treats a
 * link to something unwritten as ordinary — knowledge not yet captured — so the
 * page says what is not there and offers the way back, without suggesting
 * something went wrong.
 */
export function NotFound({ path, hint }: { path?: string; hint?: string }) {
  return (
    <State
      icon={StateIcon.file}
      title={hint ?? "Nothing at this address"}
      detail={path && <span className="text-fg font-mono break-all">{path}</span>}
      action={
        <Link to="/" className={stateButton}>
          Go to the front door
        </Link>
      }
    />
  );
}
