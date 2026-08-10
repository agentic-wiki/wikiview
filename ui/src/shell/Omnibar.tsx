import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { TreeNode } from "@/api";

/**
 * The omnibar: a clickable region in the header that opens the palette.
 *
 * Deliberately shaped like an input rather than a button. A keyboard shortcut
 * that is the only way in is invisible to anyone who does not already know it,
 * and this is the primary way to move around a large bundle. ⌘K is an
 * accelerator for a control you can also see and click.
 *
 * The region is a trigger, not the input itself. A real input in the header
 * would compete with the breadcrumb for width and leave no room for results,
 * filters, or a readable placeholder; the palette opens centred, with room for
 * all three.
 */
export function Omnibar({ tree }: { tree: TreeNode }) {
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Search entries and boards"
        className="border-border bg-bg text-muted hover:border-muted/50 hover:text-fg flex h-8 w-full max-w-sm min-w-0 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors"
      >
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2" strokeLinecap="round" />
        </svg>
        <span className="truncate">Search entries…</span>
        <kbd className="border-border text-muted ml-auto hidden shrink-0 rounded border px-1 text-[11px] font-sans sm:block">
          ⌘K
        </kbd>
      </button>
      {open && <Palette tree={tree} onClose={() => setOpen(false)} />}
    </>
  );
}

interface Item {
  path: string;
  label: string;
  hint: string;
}

function Palette({ tree, onClose }: { tree: TreeNode; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Flattened once per tree, not per keystroke.
  const all = useMemo(() => flatten(tree), [tree]);

  // Filtering runs here for now because the tree is already in memory and this
  // is a substring match, not the engine's query language. Anything richer —
  // `type:task`, `status:!done` — must go to the server: the previous attempt
  // reimplemented `--where` matching in TypeScript, and the engine being
  // importable is precisely what makes that unnecessary now.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 20);
    return all.filter((i) => i.label.toLowerCase().includes(q) || i.path.toLowerCase().includes(q)).slice(0, 20);
  }, [all, query]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => inputRef.current?.focus(), []);

  const go = (item: Item | undefined) => {
    if (!item) return;
    navigate("/wiki" + item.path);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        className="border-border bg-surface w-full max-w-xl overflow-hidden rounded-xl border shadow-2xl"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            }
            if (e.key === "Enter") go(results[selected]);
          }}
          placeholder="Search entries by name or path…"
          className="text-fg placeholder:text-muted w-full bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="border-border max-h-80 overflow-y-auto border-t">
          {results.length === 0 && <li className="text-muted px-4 py-6 text-center text-sm">No matches</li>}
          {results.map((item, i) => (
            <li key={item.path}>
              <button
                type="button"
                onMouseEnter={() => setSelected(i)}
                onClick={() => go(item)}
                className={[
                  "flex w-full items-baseline gap-3 px-4 py-2 text-left text-sm",
                  i === selected ? "bg-accent/12 text-accent" : "text-fg",
                ].join(" ")}
              >
                <span className="truncate">{item.label}</span>
                <span className="text-muted ml-auto shrink-0 truncate text-xs">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function flatten(node: TreeNode, out: Item[] = []): Item[] {
  for (const e of node.entries) {
    out.push({ path: e.path, label: e.title || e.name, hint: e.path });
  }
  for (const c of node.children) flatten(c, out);
  return out;
}
