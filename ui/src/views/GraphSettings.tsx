import { useState } from "react";
import { api, type Graph, type GraphSettings as Settings } from "@/api";
import { Filters, parseRule, ruleText } from "@/views/filters";
import { Field, SettingsDialog, saving } from "@/views/SettingsDialog";

/**
 * Editing what a graph is: its name, which entries it holds, and whether their
 * neighbours come too. Saving rewrites only these keys in the graph's own table.
 */
export function GraphSettings({ graph, onClose }: { graph: Graph; onClose: () => void }) {
  const [settings, setSettings] = useState<Settings>(() => ({
    name: graph.name,
    where: graph.where ?? [],
    neighbours: graph.neighbours,
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  return (
    <SettingsDialog
      title="Graph settings"
      path={graph.path}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => saving(() => api.graphSettings(graph.id, settings), setBusy, setError, onClose)}
    >
      <Field label="Name">
        <input
          value={settings.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={graph.name}
          className="border-border bg-bg text-fg w-full rounded-md border px-2 py-1"
        />
      </Field>

      <Filters
        noun="node"
        rules={settings.where.map(parseRule)}
        fields={graph.fields}
        onChange={(rules) => set({ where: rules.map(ruleText) })}
      />

      {/* Config rather than a view toggle, because it changes which entries the
          graph holds — the same kind of setting as the filter above it. */}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={settings.neighbours}
          onChange={(e) => set({ neighbours: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          <span className="text-fg block text-xs font-medium">Include neighbours</span>
          <span className="text-muted block text-xs">
            Also draw what those entries link to and what links to them, hollow, as context.
          </span>
        </span>
      </label>
    </SettingsDialog>
  );
}
