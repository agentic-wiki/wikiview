import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { api, type TreeNode } from "@/api";

/**
 * Declaring a board: pick a folder, name it, and it is written to the bundle's
 * `wiki.toml`.
 *
 * A config write rather than a navigation, because a board needs an address and
 * an address needs an id, which is not something a folder has. That makes this a
 * real edit to a file the user owns, so it is something asked for by filling
 * this in rather than implied by having visited a folder.
 */
export function NewBoard({
  tree,
  rootLabel,
}: {
  tree: TreeNode;
  /** What to call the bundle itself, since its folder has no name of its own. */
  rootLabel: string;
}) {
  const options = useMemo(() => folders(tree, rootLabel), [tree, rootLabel]);
  const [path, setPath] = useState(options[0]?.path ?? "/");
  const [name, setName] = useState(options[0]?.label ?? "");
  // Held separately from the name, so typing over the suggestion sticks. The
  // suggestion is what fills the field, never what the field means.
  const [id, setId] = useState(slug(options[0]?.label ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Choosing a folder refills both, because at that moment neither has been
  // typed in on purpose.
  const chooseFolder = (next: string) => {
    setPath(next);
    const label = options.find((f) => f.path === next)?.label ?? "";
    setName(label);
    setId(slug(label));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Straight to the board. The list catches up on its own: the write moves
      // the bundle's version, and the stream is what tells every client to
      // refetch — the same path every other write here takes.
      await api.declareBoard({ id, path, name });
      navigate("/kanban/" + encodeURIComponent(id));
    } catch (err) {
      // The server owns what a valid id is and which ones are taken, so its
      // message is the one worth showing rather than a guess made here.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (options.length === 0) {
    return (
      <p className="text-muted text-sm">
        No folder here holds entries yet, so there is nothing to board.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <Field label="Folder">
        <select
          value={path}
          onChange={(e) => chooseFolder(e.target.value)}
          className="border-border bg-bg text-fg w-full rounded-md border px-2 py-1"
        >
          {options.map((f) => (
            <option key={f.path} value={f.path}>
              {f.path}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Name">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setId(slug(e.target.value));
          }}
          className="border-border bg-bg text-fg w-full rounded-md border px-2 py-1"
        />
      </Field>

      <Field label="Address">
        <div className="flex items-center gap-1">
          <span className="text-muted shrink-0 font-mono text-xs">/kanban/</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            aria-label="Board id"
            className="border-border bg-bg text-fg w-full rounded-md border px-2 py-1 font-mono text-xs"
          />
        </div>
      </Field>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={busy || !id}
        className="bg-accent w-full rounded-md px-2 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Writing wiki.toml…" : "Make this a board"}
      </button>
      <p className="text-muted text-xs">
        Appends a <code>[[tool.wikiview.board]]</code> table to the bundle's{" "}
        <code>wiki.toml</code>.
      </p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-muted block text-xs">{label}</span>
      {children}
    </label>
  );
}

/**
 * A name as an id: lowercase, words joined by hyphens.
 *
 * A suggestion, offered where a person can see it and change it. The server owns
 * whether an id is valid and whether it is taken — this only has to produce
 * something usually right, and it fills a field rather than deciding anything.
 */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The folders worth offering: the ones with entries anywhere beneath them.
 *
 * A board covers a folder and everything under it, so a folder whose entries all
 * live in its children is still a board. One with nothing under it at all is
 * not, and the server refuses it for that reason — leaving it out here is the
 * same rule said earlier, where it costs nobody a round trip.
 */
function folders(root: TreeNode, rootLabel: string): { path: string; label: string }[] {
  const out: { path: string; label: string }[] = [];
  const walk = (node: TreeNode, label: string) => {
    if (!hasEntries(node)) return;
    out.push({ path: node.path, label });
    for (const child of node.children) walk(child, child.label ?? child.name);
  };
  walk(root, rootLabel);
  return out;
}

function hasEntries(node: TreeNode): boolean {
  return node.entries.length > 0 || node.children.some(hasEntries);
}
