import { useState } from "react";
import { api, type Graph, type GraphSettings as Settings } from "@/api";
import { useToast } from "@/ui/Toast";
import { Filters, parseRule, ruleText } from "@/views/filters";
import { Field, SettingsDialog, saving } from "@/views/SettingsDialog";

/**
 * Editing what a graph is: its name, which entries it holds, and whether their
 * neighbours come too. Saving rewrites only these keys in the graph's own table.
 *
 * Also how this browser draws it, where that is changed as rarely as the rest:
 * whether the highlight follows the preview. That one is kept here rather than
 * in wiki.toml, and applied by the same Apply, so Cancel undoes it like any field.
 */
export function GraphSettings({
  graph,
  follow,
  onFollow,
  onClose,
}: {
  graph: Graph;
  /** Whether the highlight follows the preview, as this browser has it. */
  follow: boolean;
  onFollow: (follow: boolean) => void;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<Settings>(() => ({
    name: graph.name,
    where: graph.where ?? [],
    neighbours: graph.neighbours,
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [following, setFollowing] = useState(follow);
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  return (
    <SettingsDialog
      title="Graph settings"
      path={graph.path}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        saving(() => api.graphSettings(graph.id, settings), setBusy, setError, () => {
          onFollow(following);
          toast("Graph saved to wiki.toml");
          onClose();
        })
      }
    >
      <Field label="Name">
        <input
          value={settings.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={graph.name}
          className="border-line-2 bg-panel-2 text-fg focus:border-accent h-9.5 w-full rounded-[9px] border px-3 text-sm outline-none"
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

      {/* Said under the box, because the footer says this dialog writes
          wiki.toml and this one box is the exception. */}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={following}
          onChange={(e) => setFollowing(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="text-fg block text-xs font-medium">Highlight follows preview</span>
          <span className="text-muted block text-xs">
            Keep the open entry and its links lit while it is open beside the graph. Saved in this browser only.
          </span>
        </span>
      </label>
    </SettingsDialog>
  );
}
