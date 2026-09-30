import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { TreeNode } from "@/api";
import { groupColour, groupsUnder } from "@/colour";
import { useEscape } from "@/ui/escape";
import { Glyph, IconButton } from "@/ui/IconButton";

/**
 * Something the palette can do rather than somewhere it can go: pull, toggle
 * the theme, open a board. Built by the shell, which holds the state each one
 * acts on.
 */
export interface Command {
  title: string;
  /** A second line saying what it acts on: "git · origin/main → main". */
  sub: string;
  /** The column on the right: "Git", "Board", "View"… */
  kind: string;
  run: () => void;
}

/**
 * The omnibar: a clickable region in the header that opens the palette.
 *
 * Deliberately shaped like an input rather than a button. A keyboard shortcut
 * that is the only way in is invisible to anyone who does not already know it,
 * and this is the primary way to move around a large bundle. ⌘K is an
 * accelerator for a control you can also see and click.
 *
 * The region is a trigger, not the input itself. A real input in the header
 * would compete with the breadcrumb for width and leave no room for results;
 * the palette opens centred, with room for them.
 */
export function Omnibar({
  tree,
  unseen,
  commands,
  compact = false,
}: {
  tree: TreeNode;
  unseen: Set<string>;
  commands: Command[];
  /** An icon rather than a field, where the header has no width for one. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {compact ? (
        <IconButton label="Search or run a command" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Glyph size={18}>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </Glyph>
        </IconButton>
      ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Search or run a command"
        className="border-line bg-panel-2 text-faint hover:border-line-2 flex h-8.5 w-[min(360px,32vw)] min-w-0 items-center gap-2.5 rounded-[9px] border pr-2 pl-3 text-left"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" className="shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="flex-1 truncate">Search or run a command…</span>
        <kbd className="border-line-2 text-muted shrink-0 rounded-[5px] border px-1.5 py-px font-mono text-[11px]">
          ⌘K
        </kbd>
      </button>
      )}
      {open && <Palette tree={tree} unseen={unseen} commands={commands} onClose={() => setOpen(false)} />}
    </>
  );
}

interface Entry {
  path: string;
  label: string;
  /** What the entry calls itself, when that is not what the filename says.
   *  Matched but not shown: an entry should be findable by either name. */
  title?: string;
  type: string;
}

/** One row of the palette: an entry to open, or a command to run. */
type Item = { entry: Entry; command?: undefined } | { command: Command; entry?: undefined };

/**
 * What the palette lists.
 *
 * With nothing typed: the first three commands, a few entries, then the rest of
 * the commands — something to do, somewhere to go, and more of each. With a
 * query: the entries that match, up to nine, then the commands that do. Both
 * are plain substring matches, because the tree is already in memory; anything
 * richer, `type:task` or `status:!done`, belongs to the engine's query language
 * on the server rather than to a reimplementation here.
 */
export function paletteItems(entries: Entry[], commands: Command[], query: string): Item[] {
  const q = query.trim().toLowerCase();
  const hits = entries
    .filter(
      (e) =>
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q) ||
        (e.title?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, q ? 9 : 5)
    .map((entry) => ({ entry }));
  const doable = commands
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q))
    .map((command) => ({ command }));
  return q ? [...hits, ...doable] : [...doable.slice(0, 3), ...hits, ...doable.slice(3)];
}

function Palette({
  tree,
  unseen,
  commands,
  onClose,
}: {
  tree: TreeNode;
  unseen: Set<string>;
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Flattened once per tree, not per keystroke.
  const all = useMemo(() => flatten(tree), [tree]);
  const groups = useMemo(() => groupsUnder(tree, "/"), [tree]);
  const items = useMemo(() => paletteItems(all, commands, query), [all, commands, query]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => inputRef.current?.focus(), []);
  useEscape(onClose);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.entry) navigate("/wiki" + item.entry.path);
    else item.command.run();
  };
  // Arrows wrap, so the last item is one press up from the first.
  const step = (by: number) =>
    setSelected((s) => (items.length === 0 ? 0 : (s + by + items.length) % items.length));

  return (
    <div
      className="animate-wv-fade fixed inset-0 z-80 flex items-start justify-center bg-black/55 p-4 pt-[12vh] backdrop-blur-[3px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        className="bg-elev shadow-float animate-wv-in w-[min(620px,92vw)] overflow-hidden rounded-2xl"
      >
        <div className="border-line flex h-14 items-center gap-3 border-b px-4">
          <svg viewBox="0 0 24 24" width="18" height="18" className="text-faint shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                step(1);
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                step(-1);
              }
              if (e.key === "Enter") choose(items[selected]);
            }}
            placeholder="Search entries, jump to a view, run git…"
            aria-label="Search entries and commands"
            className="placeholder:text-faint flex-1 bg-transparent text-base outline-none"
          />
          <kbd className="border-line-2 text-faint rounded-[5px] border px-1.5 py-px font-mono text-[11px]">esc</kbd>
        </div>
        <ul className="max-h-[min(420px,56vh)] overflow-y-auto p-1.5">
          {items.length === 0 && <li className="text-faint p-7 text-center">No matches</li>}
          {items.map((item, i) => {
            const e = item.entry;
            const title = e ? e.label : item.command.title;
            const sub = e ? e.path : item.command.sub;
            const kind = e ? (e.type === "task" ? "Task" : "Entry") : item.command.kind;
            return (
              <li key={e ? e.path : "command:" + item.command.title}>
                <button
                  type="button"
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => choose(item)}
                  aria-current={i === selected ? "true" : undefined}
                  className={[
                    "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left",
                    i === selected ? "bg-accent-bg" : "",
                  ].join(" ")}
                >
                  {/* An entry is a round mark in its group's colour, a command a
                      square one in the accent: where you go, and what you do. */}
                  <span className="bg-panel-2 grid size-6.5 shrink-0 place-items-center rounded-[7px]" aria-hidden>
                    <span
                      className={["size-2", e ? "rounded-full" : "rounded-[2px]"].join(" ")}
                      style={{ background: e ? groupColour(e.path, groups, "/") : "var(--color-accent)" }}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-fg flex items-center gap-2 font-medium">
                      <span className="truncate">{title}</span>
                      {e && unseen.has(e.path) && (
                        <span className="bg-accent size-1.5 shrink-0 rounded-full" title="Changed since you last opened it" aria-label="changed" />
                      )}
                    </span>
                    <span className="text-faint mt-px block truncate font-mono text-xs">{sub}</span>
                  </span>
                  <span className="text-faint shrink-0 text-[11.5px]">{kind}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-line text-faint flex gap-4 border-t px-4 py-2.5 text-[11.5px]">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>⌘K toggle</span>
        </div>
      </div>
    </div>
  );
}

function flatten(node: TreeNode, out: Entry[] = []): Entry[] {
  for (const e of node.entries) out.push({ path: e.path, label: e.label, title: e.title, type: e.type });
  for (const c of node.children) flatten(c, out);
  return out;
}
