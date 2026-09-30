import { useState } from "react";
import { api, type Board, type BoardSettings as Settings, type Field as FieldInfo } from "@/api";
import { Filters, parseRule, ruleText } from "@/views/filters";
import { Field, SettingsDialog, saving } from "@/views/SettingsDialog";

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

  return (
    <SettingsDialog
      title="Board settings"
      path={board.path}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => saving(() => api.boardSettings(board.id, settings), setBusy, setError, onClose)}
    >
      <Field label="Name">
        <input
          value={settings.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={board.name}
          className="border-line-2 bg-panel-2 text-fg w-full rounded-md border px-2 py-1"
        />
      </Field>

      <Filters
        noun="card"
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
        <div role="tablist" className="border-line flex gap-1 border-b">
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
    </SettingsDialog>
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
              className="border-line text-muted hover:text-fg rounded border px-1.5 py-0.5 font-mono text-xs"
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
          className="border-line-2 bg-panel-2 text-fg min-w-0 grow rounded-md border px-2 py-1 font-mono text-xs"
        />
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => add(adding)}
          className="border-line text-muted hover:text-fg shrink-0 rounded-md border px-2 py-1 text-xs capitalize disabled:opacity-50"
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
      className="border-line-2 bg-panel-2 text-fg w-full rounded-md border px-2 py-1 font-mono text-xs"
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

