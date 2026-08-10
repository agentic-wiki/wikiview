import { useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { BundleInfo, TreeNode } from "@/api";
import { Rail, type RailSection } from "@/shell/Rail";
import { Breadcrumbs } from "@/shell/Breadcrumbs";
import { Tree } from "@/shell/Tree";

/**
 * The chrome every view sits inside: a rail, a collapsible panel, a breadcrumb
 * header, and the view area.
 *
 * One layout rather than a preference. Breadcrumbs, a panel and a palette are
 * affordances that compose rather than alternatives that compete, and two
 * selectable layouts would mean two sets of states, two responsive behaviours,
 * and every future view built twice.
 */
export function Shell({
  bundle,
  tree,
  children,
}: {
  bundle: BundleInfo;
  tree: TreeNode;
  children: ReactNode;
}) {
  const [section, setSection] = useState<RailSection>("entries");
  // Open on desktop, closed on narrow screens. Boards and grids need width;
  // this is a working tool on a wide screen before it is a phone app.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 768);
  const location = useLocation();
  const path = location.pathname.replace(/^\/wiki\/?/, "");

  return (
    <div className="flex h-full flex-col">
      <header className="border-border bg-surface flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <button
          type="button"
          aria-label={panelOpen ? "Hide navigation" : "Show navigation"}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
          className="text-muted hover:text-fg hover:bg-fg/5 grid size-8 shrink-0 place-items-center rounded-md"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>

        <Breadcrumbs bundleName={basename(bundle.dir)} path={path} />

        <div className="grow" />

        {/* A small affordance, not an input: a persistent search field would
            fight the path for width, so the palette opens as an overlay. */}
        <button
          type="button"
          className="border-border text-muted hover:text-fg hidden shrink-0 items-center gap-2 rounded-md border px-2 py-1 text-xs sm:flex"
        >
          Search
          <kbd className="border-border rounded border px-1 font-sans">⌘K</kbd>
        </button>
      </header>

      <div className="relative flex min-h-0 grow">
        <Rail active={section} onSelect={setSection} />

        {/* Offset by the rail's collapsed width; the rail expands over this
            rather than pushing it, so nothing here reflows. */}
        <aside
          className={[
            "border-border bg-bg ml-14 shrink-0 overflow-y-auto border-r",
            "transition-[width] duration-200 ease-out",
            panelOpen ? "w-64" : "w-0 border-r-0",
          ].join(" ")}
        >
          {panelOpen && section === "entries" && <Tree node={tree} />}
          {panelOpen && section === "boards" && (
            <p className="text-muted p-3 text-sm">No boards declared yet.</p>
          )}
          {panelOpen && section === "search" && (
            <p className="text-muted p-3 text-sm">Search is not built yet.</p>
          )}
        </aside>

        <main className="min-w-0 grow overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function basename(dir: string): string {
  const parts = dir.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] ?? dir;
}
