import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { api, type Field as FieldInfo, type TreeNode } from "@/api";
import { useToast } from "@/ui/Toast";
import { Filters, parseRule, ruleText } from "@/views/filters";
import { Field, SettingsDialog, saving } from "@/views/SettingsDialog";

/**
 * What differs between declaring one kind of view and another: where it lives,
 * what the button says, and which request writes it. Everything else — the
 * folder, the name, the suggested id, the filter — is the same form.
 */
const KINDS = {
  board: { prefix: "/kanban", noun: "board", item: "card", idLabel: "Board id", declare: api.declareBoard },
  graph: { prefix: "/graph", noun: "graph", item: "node", idLabel: "Graph id", declare: api.declareGraph },
} as const;

type Kind = keyof typeof KINDS;

/**
 * The way to declare a view: a button that opens the form in a dialog.
 *
 * One button wherever a view can be made — the panel listing them, and a board
 * with nothing on it — so making one is the same gesture everywhere, and the
 * form has room for what a view is made of rather than squeezing into a panel.
 */
export function NewView({
  kind,
  tree,
  rootLabel,
}: {
  kind: Kind;
  tree: TreeNode;
  /** What to call the bundle itself, since its folder has no name of its own. */
  rootLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => folders(tree, rootLabel), [tree, rootLabel]);
  const { noun } = KINDS[kind];

  if (options.length === 0) {
    return (
      <p className="text-muted text-sm">
        No folder here holds entries yet, so there is nothing to make a {noun} of.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-line-2 text-muted hover:border-faint hover:text-fg flex h-9 w-full items-center gap-2 rounded-[9px] border border-dashed px-2.5"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        New {noun}
      </button>
      {open && <NewViewDialog kind={kind} options={options} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Declaring a view: pick a folder, name it, say which of its entries it holds,
 * and it is written to the bundle's `wiki.toml`.
 *
 * A config write rather than a navigation, because a view needs an address and
 * an address needs an id, which is not something a folder has. That makes this a
 * real edit to a file the user owns, so it is something asked for by filling
 * this in rather than implied by having visited a folder.
 */
function NewViewDialog({
  kind,
  options,
  onClose,
}: {
  kind: Kind;
  options: Folder[];
  onClose: () => void;
}) {
  // Never empty: the button that opens this is not offered without a folder.
  const first = options[0]!;
  const [path, setPath] = useState(first.path);
  const [name, setName] = useState(first.label);
  // Held separately from the name, so typing over the suggestion sticks. The
  // suggestion is what fills the field, never what the field means.
  const [id, setId] = useState(slug(first.label));
  // Null until the server has said what a view here starts as. The default
  // filter is the server's, so the form waits for it rather than guessing.
  const [where, setWhere] = useState<string[] | null>(null);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { prefix, noun, item, idLabel, declare } = KINDS[kind];

  // The keys follow the folder, since they are what is there to filter by. The
  // filter is taken from the first answer only: once it is on screen it is
  // yours, and choosing another folder is not a reason to throw it away.
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .draft(kind, path, ctrl.signal)
      .then((d) => {
        setFields(d.fields);
        setWhere((w) => w ?? d.where);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => ctrl.abort();
  }, [kind, path]);

  // Choosing a folder refills both, because at that moment neither has been
  // typed in on purpose.
  const chooseFolder = (next: string) => {
    setPath(next);
    const label = options.find((f) => f.path === next)?.label ?? "";
    setName(label);
    setId(slug(label));
  };

  return (
    <SettingsDialog
      title={`New ${noun}`}
      path={path}
      busy={busy || where === null}
      error={error}
      action={`Create ${noun}`}
      onClose={onClose}
      onSubmit={() =>
        // The server owns what a valid id is and which ones are taken, so its
        // message is the one worth showing rather than a guess made here.
        saving(() => declare({ id, path, name, where: where ?? [] }), setBusy, setError, () => {
          toast(`Created ${noun} ${name || id}`);
          onClose();
          // Straight to the view. The list catches up on its own: the write
          // moves the bundle's version, and the stream is what tells every
          // client to refetch — the same path every other write here takes.
          navigate(prefix + "/" + encodeURIComponent(id));
        })
      }
    >
      <Field label="Folder">
        <select
          value={path}
          onChange={(e) => chooseFolder(e.target.value)}
          className="border-line-2 bg-panel-2 text-fg focus:border-accent h-9.5 w-full rounded-[9px] border px-2.5 text-sm outline-none"
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
          className="border-line-2 bg-panel-2 text-fg focus:border-accent h-9.5 w-full rounded-[9px] border px-3 text-sm outline-none"
        />
      </Field>

      <Field label="Address">
        <div className="flex items-center gap-1">
          <span className="text-faint shrink-0 font-mono text-xs">{prefix}/</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            aria-label={idLabel}
            className="border-line-2 bg-panel-2 text-fg focus:border-accent h-9.5 w-full rounded-[9px] border px-3 font-mono text-xs outline-none"
          />
        </div>
      </Field>

      {where !== null && (
        <Filters
          noun={item}
          rules={where.map(parseRule)}
          fields={fields}
          onChange={(rules) => setWhere(rules.map(ruleText))}
        />
      )}
    </SettingsDialog>
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

interface Folder {
  path: string;
  label: string;
}

/**
 * The folders worth offering: the ones with entries anywhere beneath them.
 *
 * A view covers a folder and everything under it, so a folder whose entries all
 * live in its children is still a candidate. One with nothing under it at all is
 * not, and the server refuses it for that reason — leaving it out here is the
 * same rule said earlier, where it costs nobody a round trip.
 */
function folders(root: TreeNode, rootLabel: string): Folder[] {
  const out: Folder[] = [];
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
