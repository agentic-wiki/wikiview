import { useEffect, useState } from "react";
import { api, type Board, type BoardSettings as Settings, type Field as FieldInfo } from "@/api";

/**
 * Editing what a board is, rather than what is on it.
 *
 * Everything a board reads has always been configurable; what was missing was a
 * way to change it without leaving for `wiki.toml`. Saving rewrites only these
 * keys in the board's own table and leaves every other byte of the file alone.
 */
export function BoardSettings({
  board,
  onClose,
}: {
  board: Board;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<Settings>(() => current(board));
  const [tab, setTab] = useState<"columns" | "lanes">("columns");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  // What the entries actually have on each axis, so pinning is a click rather
  // than retyping a value already on screen. The unnamed one is left out: it is
  // not a value anybody wrote, so there is nothing to pin.
  const presentColumns = board.columns.map((c) => c.value).filter((v) => v !== "");
  const presentLanes = (board.lanes ?? []).filter((v) => v !== "");

  // A column or a lane is one value, and a list has many, so a list-valued key
  // is not offered as either. It stays in the filter, where membership is
  // exactly what `tags=bug` means.
  const groupable = board.fields.filter((f) => !f.list);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.boardSettings(board.id, settings);
      onClose();
    } catch (err) {
      // The server owns whether a filter parses and whether the table can be
      // edited at all, so its words are the ones worth showing.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-print="hide"
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onClick={onClose}
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Board settings"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        className="border-border bg-bg flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-2xl"
      >
        {/* The path was here and is now under the name, where it says which
            board this is rather than sitting where a dialog's close is. */}
        <header className="border-border flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <span className="text-fg block text-sm font-medium">Board settings</span>
            <span className="text-muted block truncate font-mono text-xs">{board.path}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-muted hover:text-fg hover:bg-fg/5 ml-auto grid size-7 shrink-0 place-items-center rounded-md"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 grow space-y-5 overflow-y-auto p-4 text-sm">
          <Field label="Name">
            <input
              value={settings.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={board.name}
              className="border-border bg-bg text-fg w-full rounded-md border px-2 py-1"
            />
          </Field>

          <Filters
            rules={settings.where.map(parseRule)}
            fields={board.fields}
            onChange={(rules) => set({ where: rules.map(ruleText) })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Columns from">
              <KeyPicker
                value={settings.status}
                fields={groupable}
                label="Status field"
                onChange={(status) => set({ status })}
              />
            </Field>
            <Field label="Lanes from">
              <KeyPicker
                value={settings.lane}
                fields={groupable}
                label="Lane field"
                none="— no lanes —"
                onChange={(lane) => set({ lane })}
              />
            </Field>
          </div>

          {/* Which field says what an entry waits on, which the badges on the
              cards count. A convention rather than part of the format, so a
              bundle that spells it `waits_on` is not wrong. */}
          <Field label="Waiting on">
            <KeyPicker
              value={settings.blockers}
              fields={board.fields}
              label="Blockers field"
              none="— not tracked —"
              onChange={(blockers) => set({ blockers })}
            />
          </Field>

          {/* Two axes, one shape: an ordered list of values for a field. Tabbed
              rather than stacked because they are alternatives to look at, not
              two things to fill in, and side by side they would halve the width
              each has for a value like `in-progress`. */}
          <div className="space-y-2">
            <div role="tablist" className="border-border flex gap-1 border-b">
              {(["columns", "lanes"] as const).map((axis) => (
                <button
                  key={axis}
                  type="button"
                  role="tab"
                  aria-selected={tab === axis}
                  onClick={() => setTab(axis)}
                  className={[
                    "-mb-px border-b-2 px-3 py-1.5 text-xs font-medium capitalize",
                    tab === axis
                      ? "border-accent text-fg"
                      : "text-muted hover:text-fg border-transparent",
                  ].join(" ")}
                >
                  {axis}
                </button>
              ))}
            </div>

            {tab === "lanes" && settings.lane === "" ? (
              // Said rather than hidden: a missing tab reads as a feature that
              // does not exist, and the fix is one control up.
              <p className="text-muted px-1 py-2 text-xs">
                No lane field, so there are no lanes to order.
              </p>
            ) : (
              <Axis
                label={tab === "columns" ? "column" : "lane"}
                values={tab === "columns" ? settings.columns : settings.lanes}
                present={tab === "columns" ? presentColumns : presentLanes}
                onChange={(next) => set(tab === "columns" ? { columns: next } : { lanes: next })}
              />
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <footer className="border-border flex shrink-0 items-center gap-2 border-t px-4 py-3">
          <span className="text-muted text-xs">Writes to the bundle's wiki.toml.</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg ml-auto rounded-md px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="bg-accent rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}

/**
 * One axis of a board: the values it is pinned to, in order.
 *
 * The list *is* the config value, which is why order is edited here rather than
 * inferred from a set of checkboxes: being in the list is what pinning means,
 * and where in the list is the only place an order can be said.
 *
 * Buttons rather than dragging. The board already drags, so this could too — but
 * this is where a board gets configured, and configuration reachable only with a
 * pointer is configuration some people cannot do. A five-item list is not the
 * place to spend that.
 */
function Axis({
  label,
  values,
  present,
  onChange,
}: {
  /** What one of these is called, for the labels a screen reader reads. */
  label: string;
  values: string[];
  /** What the entries actually have, so pinning is a click rather than retyping
   *  a value already on screen. */
  present: string[];
  onChange: (values: string[]) => void;
}) {
  const [adding, setAdding] = useState("");
  const rest = present.filter((v) => !values.includes(v));
  const canAdd = adding !== "" && !values.includes(adding);
  const add = (value: string) => {
    onChange([...values, value]);
    setAdding("");
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= values.length) return;
    const next = [...values];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {values.length === 0 ? (
        <p className="text-muted px-1 py-1 text-xs">
          Nothing pinned, so the order is the one wikiview infers.
        </p>
      ) : (
        <ul aria-label={`Pinned ${label}s`} className="max-h-40 space-y-1 overflow-y-auto">
          {values.map((value, i) => (
            <li key={value} className="hover:bg-fg/5 flex items-center gap-1 rounded-md px-1 py-1">
              <span className="text-fg grow truncate font-mono text-xs">{value}</span>
              {!present.includes(value) && (
                <span className="text-muted shrink-0 text-xs">nothing has it yet</span>
              )}
              <Nudge label={`Move ${value} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <path d="M6 15l6-6 6 6" />
              </Nudge>
              <Nudge
                label={`Move ${value} down`}
                disabled={i === values.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <path d="M6 9l6 6 6-6" />
              </Nudge>
              <button
                type="button"
                aria-label={`Unpin ${value}`}
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="text-muted hover:text-fg shrink-0 px-1 text-xs"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* What the entries have but nothing has pinned. One click each, because
          the alternative is retyping a value that is already on screen. */}
      {rest.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted text-xs">Also in use:</span>
          {rest.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => add(value)}
              aria-label={`Pin ${value}`}
              className="border-border text-muted hover:text-fg rounded border px-1.5 py-0.5 font-mono text-xs"
            >
              + {value}
            </button>
          ))}
        </div>
      )}

      {/* A value nothing has yet is the whole reason to pin one, and inference
          can never produce it. */}
      <div className="flex gap-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          // Enter adds rather than saving the dialog, which is what a text box
          // beside a button is for. A nested form would be the other way to say
          // it, and HTML does not allow one.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canAdd) add(adding);
            }
          }}
          placeholder={label === "column" ? "in-progress" : "urgent"}
          aria-label={`New ${label}`}
          className="border-border bg-bg text-fg min-w-0 grow rounded-md border px-2 py-1 font-mono text-xs"
        />
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => add(adding)}
          className="border-border text-muted hover:text-fg shrink-0 rounded-md border px-2 py-1 text-xs capitalize disabled:opacity-50"
        >
          Add {label}
        </button>
      </div>
    </div>
  );
}

/** One of the two order buttons, which differ only by which way the arrow points. */
function Nudge({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="text-muted hover:text-fg hover:bg-fg/10 shrink-0 rounded p-0.5 disabled:opacity-30"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

/**
 * Picking a frontmatter key.
 *
 * A list of what the folder actually has, because the alternative is recalling
 * whether this bundle spells it `status` or `state`, and a typo there is a board
 * with one column. The current value is always an option even when nothing has
 * it: a field can be configured before the entries catch up, and dropping it
 * from the list would silently change the board on the next save.
 */
function KeyPicker({
  value,
  fields,
  label,
  none,
  onChange,
}: {
  value: string;
  fields: FieldInfo[];
  label: string;
  /** What to call the empty option, for a field that is allowed to have none. */
  none?: string;
  onChange: (value: string) => void;
}) {
  const keys = fields.map((f) => f.key);
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="border-border bg-bg text-fg w-full rounded-md border px-2 py-1 font-mono text-xs"
    >
      {none !== undefined && <option value="">{none}</option>}
      {value !== "" && !keys.includes(value) && <option value={value}>{value} (nothing has it)</option>}
      {keys.map((key) => (
        <option key={key} value={key}>
          {key}
        </option>
      ))}
    </select>
  );
}

/**
 * The board's filter, as rows rather than a line of syntax to get right.
 *
 * `key=value` is a small language, but it is one nobody should have to be told:
 * the keys and the values are both known, and a mistyped one silently empties
 * the board rather than complaining. Rows also make removing a condition a
 * click, which is the thing most often wanted and the hardest to do by editing
 * text.
 */
function Filters({
  rules,
  fields,
  onChange,
}: {
  rules: Rule[];
  fields: FieldInfo[];
  onChange: (rules: Rule[]) => void;
}) {
  const at = (i: number, patch: Partial<Rule>) =>
    onChange(rules.map((r, j) => (i === j ? { ...r, ...patch, raw: undefined } : r)));

  return (
    <div className="space-y-2">
      <span className="text-fg block text-xs font-medium">A card is an entry matching</span>
      <ul className="space-y-1">
        {rules.map((rule, i) => (
          <li key={i} className="flex items-center gap-1">
            {/* A condition nobody here can read is shown as it was written rather
                than reshaped into something that means something else. */}
            {rule.raw !== undefined ? (
              <span className="text-fg grow truncate font-mono text-xs" title="Not a filter">
                {rule.raw}
              </span>
            ) : (
              <>
                <select
                  value={rule.key}
                  aria-label="Filter key"
                  onChange={(e) => at(i, { key: e.target.value, value: "" })}
                  className="border-border bg-bg text-fg min-w-0 grow rounded-md border px-1 py-1 font-mono text-xs"
                >
                  {!fields.some((f) => f.key === rule.key) && (
                    <option value={rule.key}>{rule.key}</option>
                  )}
                  {fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.key}
                    </option>
                  ))}
                </select>
                <select
                  value={rule.negated ? "!=" : "="}
                  aria-label="Filter operator"
                  onChange={(e) => at(i, { negated: e.target.value === "!=" })}
                  className="border-border bg-bg text-fg shrink-0 rounded-md border px-1 py-1 text-xs"
                >
                  <option value="=">is</option>
                  <option value="!=">is not</option>
                </select>
                <ValuePicker
                  value={rule.value}
                  values={fields.find((f) => f.key === rule.key)?.values}
                  id={"filter-values-" + i}
                  onChange={(value) => at(i, { value })}
                />
              </>
            )}
            <button
              type="button"
              aria-label={"Remove filter " + (i + 1)}
              onClick={() => onChange(rules.filter((_, j) => j !== i))}
              className="text-muted hover:text-fg shrink-0 px-1 text-xs"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={fields.length === 0}
        onClick={() => onChange([...rules, { key: fields[0]?.key ?? "", negated: false, value: "" }])}
        className="border-border text-muted hover:text-fg rounded-md border px-2 py-1 text-xs disabled:opacity-50"
      >
        Add filter
      </button>
      {rules.length === 0 && (
        // The one state the heading does not describe on its own: with nothing
        // listed, "matching" reads as a question rather than an answer.
        <p className="text-muted text-xs">Nothing, so every entry in the folder is a card.</p>
      )}
    </div>
  );
}

/**
 * A filter's value: typed, with what the key already holds as suggestions.
 *
 * Not a list to pick from, unlike the key. A filter is often written *before*
 * the entries catch up — `status=in-review` on the day you invent that status —
 * and a board you cannot describe until something already matches it is a board
 * you cannot set up.
 *
 * The placeholder carries the one thing an empty box does not say for itself:
 * empty is a value, and `status=` matches an entry that has no status.
 */
function ValuePicker({
  value,
  values,
  id,
  onChange,
}: {
  value: string;
  values?: string[];
  /** Ties the input to its own suggestion list, since several sit on one form. */
  id: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <input
        value={value}
        aria-label="Filter value"
        list={values ? id : undefined}
        placeholder="(nothing)"
        onChange={(e) => onChange(e.target.value)}
        className="border-border bg-bg text-fg min-w-0 grow rounded-md border px-1 py-1 font-mono text-xs"
      />
      {values && (
        <datalist id={id}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** A labelled input. The label says what it is; a sentence under every one of
 *  them is a wall of text explaining boxes that were already labelled. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-fg block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

/** A board's settings as they stand, which is what the form starts from. */
function current(board: Board): Settings {
  return {
    name: board.name,
    status: board.field,
    lane: board.lane ?? "",
    blockers: board.blockers ?? "",
    where: board.where ?? [],
    columns: board.columns.filter((c) => c.pinned).map((c) => c.value),
    // Every band the board has, in the order it is showing them: saving from
    // this form pins what is on screen rather than silently reordering it.
    lanes: (board.lanes ?? []).filter((l) => l !== ""),
  };
}

/** One condition of a board's filter. `raw` is set only when the stored text is
 *  not one, which a hand-written wiki.toml can hold. */
interface Rule {
  key: string;
  negated: boolean;
  value: string;
  raw?: string;
}

/**
 * A stored `where` entry as a row.
 *
 * `!=` before `=`, which is the engine's own order — the other way round, `a!=b`
 * would read as the key `a!` equal to `b`.
 */
function parseRule(text: string): Rule {
  for (const [op, negated] of [
    ["!=", true],
    ["=", false],
  ] as const) {
    const at = text.indexOf(op);
    if (at > 0) {
      return { key: text.slice(0, at), negated, value: text.slice(at + op.length) };
    }
  }
  // Not a filter. Kept as written and sent back as written, so the server says
  // so rather than this quietly turning it into something that parses.
  return { key: "", negated: false, value: "", raw: text };
}

function ruleText(rule: Rule): string {
  return rule.raw ?? rule.key + (rule.negated ? "!=" : "=") + rule.value;
}
