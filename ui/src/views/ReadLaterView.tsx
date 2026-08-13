import type { TreeNode } from "@/api";
import type { Queue } from "@/queue";
import { describe } from "@/tree";
import { count, FileIcon, Row } from "@/views/listing";

/**
 * Everything you saved to read later.
 *
 * A page rather than the panel this started as. Persisting rows make a panel
 * *possible* — nothing vanishes under the cursor the way it does on the changed
 * list — but they do not make one necessary, and a 256-pixel column truncates a
 * title at about four words. This list is consulted when you finish something and
 * choose what is next, which is a place you go rather than a companion you keep;
 * the tree stays the panel because steering a hierarchy is constant while
 * reading.
 *
 * So every rail icon now takes you somewhere, and there is one home for this list
 * rather than two with a control in each.
 */
export function ReadLaterView({
  queue,
  tree,
  rootLabel,
}: {
  queue: Queue;
  tree: TreeNode;
  /** What to call the bundle root, for an entry that lives in it. */
  rootLabel: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-fg text-2xl font-semibold tracking-tight">Read later</h1>
      <p className="text-muted mt-1 text-sm">
        {queue.paths.length === 0
          ? "Nothing saved yet. While reading an entry that deserves more time than you have, save it with the bookmark button."
          : `${count(queue.paths.length, "entry", "entries")} to come back to, in the order you saved them. Opening one leaves it here until you take it off.`}
      </p>

      <ul className="mt-6 space-y-1">
        {queue.paths.map((path) => {
          // An entry that has gone keeps its filename and says so, rather than
          // being dropped: a list that quietly loses things is a list you stop
          // trusting.
          const { name, where, missing } = describe(tree, path, rootLabel);
          return (
            <Row
              key={path}
              // A path with nothing behind it still goes somewhere honest: the
              // reader's placeholder for an entry nobody has written says so,
              // where a dead row would just sit there.
              to={"/wiki" + path}
              icon={<FileIcon />}
              title={name}
              subtitle={where}
              meta={missing ? "missing" : undefined}
              // Taking it off is explicit, because opening it never will. This is
              // the only place that can do it, now that the list has one home.
              action={
                <button
                  type="button"
                  onClick={() => queue.toggle(path)}
                  aria-label={`Remove ${name} from read later`}
                  title="Remove from read later"
                  className="text-muted hover:text-fg hover:bg-fg/5 grid size-8 shrink-0 place-items-center rounded-md"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              }
            />
          );
        })}
      </ul>
    </div>
  );
}
