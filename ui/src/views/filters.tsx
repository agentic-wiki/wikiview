import type { Field as FieldInfo } from "@/api";

/**
 * A view's filter, as rows rather than a line of syntax to get right.
 *
 * `key=value` is a small language, but it is one nobody should have to be told:
 * the keys and the values are both known, and a mistyped one silently empties
 * the board rather than complaining. Rows also make removing a condition a
 * click, which is the thing most often wanted and the hardest to do by editing
 * text.
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
  const at = (i: number, patch: Partial<Rule>) =>
    onChange(rules.map((r, j) => (i === j ? { ...r, ...patch, raw: undefined } : r)));

  return (
    <div className="space-y-2">
      <span className="text-fg block text-xs font-medium">A {noun} is an entry matching</span>
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
        <p className="text-muted text-xs">Nothing, so every entry in the folder is a {noun}.</p>
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
