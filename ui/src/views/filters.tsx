import { useState } from "react";
import type { Field as FieldInfo } from "@/api";
import { useEscape } from "@/ui/escape";

/**
 * A view's filter, as chips rather than a line of syntax to get right.
 *
 * `key=value` is a small language, but it is one nobody should have to be told:
 * the keys and the values are both known, and a mistyped one silently empties
 * the board rather than complaining. A filter is read far more often than it
 * is written, so each condition reads as a sentence (`type is task`), and
 * removing one is its ✕. Clicking one opens it in the editor under the chips;
 * "+ Filter" adds one and opens it there.
 *
 * Edits apply as they are made, so there is no draft for the dialog's Save to
 * miss: the editor only says which condition is being changed.
 */
export function Filters({
  noun,
  rules,
  fields,
  onChange,
}: {
  /** What an entry that passes becomes: a card, a node. */
  noun: string;
  rules: Rule[];
  fields: FieldInfo[];
  onChange: (rules: Rule[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const at = (i: number, patch: Partial<Rule>) =>
    onChange(rules.map((r, j) => (i === j ? { ...r, ...patch, raw: undefined } : r)));
  const remove = (i: number) => {
    onChange(rules.filter((_, j) => j !== i));
    // The editor follows its condition, or closes with it.
    if (editing === i) setEditing(null);
    else if (editing !== null && editing > i) setEditing(editing - 1);
  };
  const add = () => {
    onChange([...rules, { key: fields[0]?.key ?? "", negated: false, value: "" }]);
    setEditing(rules.length);
  };
  const edited = editing === null ? undefined : rules[editing];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted text-[12.5px] font-medium">A {noun} is an entry matching</span>
      <div className="border-line bg-panel-2 flex flex-col gap-2 rounded-[10px] border p-2">
        <ul className="flex flex-wrap items-center gap-1.5">
          {rules.map((rule, i) => (
            <li
              key={i}
              className={[
                "bg-elev flex h-7 max-w-full items-center rounded-[7px] border font-mono text-[12.5px]",
                editing === i ? "border-accent" : "border-transparent",
              ].join(" ")}
            >
              {/* A condition nobody here can read is shown as it was written rather
                  than reshaped into something that means something else. */}
              {rule.raw !== undefined ? (
                <span className="text-warn truncate pl-2.5" title="Not a filter">
                  {rule.raw}
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Edit filter ${i + 1}`}
                  aria-expanded={editing === i}
                  onClick={() => setEditing(editing === i ? null : i)}
                  className="text-fg flex h-full min-w-0 items-center gap-1.5 pl-2.5"
                >
                  <span className="truncate">{rule.key}</span>
                  <span className="text-faint shrink-0">{rule.negated ? "is not" : "is"}</span>
                  <span className={rule.value ? "text-accent-ink truncate" : "text-faint truncate"}>
                    {rule.value || "(nothing)"}
                  </span>
                </button>
              )}
              <button
                type="button"
                aria-label={"Remove filter " + (i + 1)}
                onClick={() => remove(i)}
                className="text-faint hover:text-fg grid h-full shrink-0 place-items-center pr-1.5 pl-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              disabled={fields.length === 0}
              onClick={add}
              className="border-line-2 text-muted hover:text-fg h-7 rounded-[7px] border border-dashed px-2.5 text-[12.5px] disabled:opacity-50"
            >
              + Filter
            </button>
          </li>
        </ul>
        {edited && editing !== null && edited.raw === undefined && (
          <Editor
            rule={edited}
            index={editing}
            fields={fields}
            onChange={(patch) => at(editing, patch)}
            onDone={() => setEditing(null)}
          />
        )}
      </div>
      {rules.length === 0 && (
        // The one state the heading does not describe on its own: with nothing
        // listed, "matching" reads as a question rather than an answer.
        <p className="text-muted text-xs">Nothing, so every entry in the folder is a {noun}.</p>
      )}
    </div>
  );
}

/** One condition, open for changing: its key, is or is not, and its value. */
function Editor({
  rule,
  index,
  fields,
  onChange,
  onDone,
}: {
  rule: Rule;
  index: number;
  fields: FieldInfo[];
  onChange: (patch: Partial<Rule>) => void;
  onDone: () => void;
}) {
  // Escape closes the editor, not the dialog under it.
  useEscape(onDone);
  return (
    <div className="flex items-center gap-1">
      <select
        value={rule.key}
        aria-label="Filter key"
        onChange={(e) => onChange({ key: e.target.value, value: "" })}
        className="border-line-2 bg-elev text-fg focus:border-accent h-7 min-w-0 grow rounded-[7px] border px-1.5 font-mono text-[12.5px] outline-none"
      >
        {!fields.some((f) => f.key === rule.key) && <option value={rule.key}>{rule.key}</option>}
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.key}
          </option>
        ))}
      </select>
      <select
        value={rule.negated ? "!=" : "="}
        aria-label="Filter operator"
        onChange={(e) => onChange({ negated: e.target.value === "!=" })}
        className="border-line-2 bg-elev text-faint h-7 shrink-0 rounded-[7px] border px-1 text-[12.5px]"
      >
        <option value="=">is</option>
        <option value="!=">is not</option>
      </select>
      <ValuePicker
        value={rule.value}
        values={fields.find((f) => f.key === rule.key)?.values}
        id={"filter-values-" + index}
        onChange={(value) => onChange({ value })}
        onEnter={onDone}
      />
      <button
        type="button"
        onClick={onDone}
        className="border-line-2 text-muted hover:text-fg h-7 shrink-0 rounded-[7px] border px-2.5 text-[12.5px]"
      >
        Done
      </button>
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
  onEnter,
}: {
  value: string;
  values?: string[];
  /** Ties the input to its own suggestion list, since several sit on one form. */
  id: string;
  onChange: (value: string) => void;
  /** Enter finishes the condition, rather than submitting the dialog's form. */
  onEnter: () => void;
}) {
  return (
    <>
      <input
        value={value}
        aria-label="Filter value"
        list={values ? id : undefined}
        placeholder="(nothing)"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          onEnter();
        }}
        className="border-line-2 bg-elev text-fg focus:border-accent h-7 min-w-0 grow rounded-[7px] border px-1.5 font-mono text-[12.5px] outline-none"
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


/** One condition of a view's filter. `raw` is set only when the stored text is
 *  not one, which a hand-written wiki.toml can hold. */
export interface Rule {
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
export function parseRule(text: string): Rule {
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

export function ruleText(rule: Rule): string {
  return rule.raw ?? rule.key + (rule.negated ? "!=" : "=") + rule.value;
}
