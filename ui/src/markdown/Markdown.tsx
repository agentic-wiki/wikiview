import { useMemo } from "react";
import { Link as RouterLink } from "react-router";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Entry } from "@/api";

/** The source position react-markdown attaches to every node it renders. */
type WithNode = { node?: { position?: { start?: { line?: number } } } };

const lineOf = (props: unknown): number | undefined =>
  (props as WithNode)?.node?.position?.start?.line;

/**
 * Renders an entry's markdown.
 *
 * The two engine rules it needs arrive as data and are applied by lookup, never
 * re-derived: an href is resolved by finding it in `entry.links`, and a heading
 * takes its id from `entry.headings`. Getting either subtly wrong is invisible —
 * a link that quietly 404s, an anchor `wiki check` calls valid that never
 * scrolls — which is why neither is computed here.
 *
 * Everything is matched by **source line**, not by walking the document and
 * counting. Counting assumes the renderer visits nodes in source order exactly
 * once, which is not a promise React makes: a double render under StrictMode is
 * enough to exhaust a cursor and silently drop every id. Positions are exact and
 * order-independent, and the server already sends a line with each heading and
 * checkbox.
 */
export function Markdown({
  entry,
  onToggleCheckbox,
  destination = (path) => "/wiki" + path,
}: {
  entry: Entry;
  onToggleCheckbox?: (line: number, done: boolean) => void;
  /**
   * Where a link to a bundle path should go. The reader sends you to the entry;
   * a board sends you to the card when the target is one of its own, so
   * following a link inside a card does not throw away the board you are
   * reading it on.
   *
   * A function rather than a flag, because the caller is the only one that
   * knows what is on screen behind this. Resolution still happens by lookup in
   * `entry.links` — this only decides what to do with the answer.
   */
  destination?: (bundlePath: string) => string;
}) {
  // Keyed by the href exactly as written, which is what the renderer hands back.
  const links = useMemo(() => new Map(entry.links.map((l) => [l.raw, l])), [entry.links]);
    // Keyed by body line, because that is the coordinate system the rendered
  // markdown is in. The file line rides along for writes.
  const headings = useMemo(() => new Map(entry.headings.map((h) => [h.bodyLine, h])), [entry.headings]);
  const checkboxes = useMemo(
    () => new Map(entry.checkboxes.map((c) => [c.bodyLine, c])),
    [entry.checkboxes],
  );

  const heading = (level: number) =>
    function H({ children, ...props }: { children?: React.ReactNode }) {
      const id = headings.get(lineOf(props) ?? -1)?.id;
      const Tag = `h${level}` as "h1";
      return (
        <Tag id={id} className="group scroll-mt-16">
          {children}
          {id && (
            <a
              href={"#" + id}
              aria-label="Link to this section"
              className="text-muted hover:text-accent ml-2 no-underline opacity-0 transition-opacity group-hover:opacity-100"
            >
              #
            </a>
          )}
        </Tag>
      );
    };

  const components: Components = {
    a({ href, children, node: _node, ...props }) {
      const link = href ? links.get(href) : undefined;

      // A link out of the bundle is not navigable here: wikiview serves this
      // bundle and nothing above it. Rendered as marked text rather than as an
      // anchor, because an anchor with a relative href resolves against the
      // current route and a click becomes a full page load into a 404.
      if (link?.outside) {
        return (
          <span
            className="text-muted underline decoration-dotted underline-offset-2"
            title={`${href} is outside this bundle`}
          >
            {children}
          </span>
        );
      }

      // A file the bundle carries rather than an entry: a diagram, a contract,
      // a spreadsheet. A new tab, because leaving the reader to look at a PDF
      // and then having to navigate back is worse than having both.
      if (link?.asset) {
        return (
          <a
            href={link.asset}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent underline decoration-1 underline-offset-2"
            title={`${link.to} — opens in a new tab`}
          >
            {children}
          </a>
        );
      }

      if (!link) {
        // Not an internal bundle link: an external URL, a bare fragment, or one
        // resolving outside the bundle. Left exactly as authored.
        const external = href?.startsWith("http");
        return (
          <a
            href={href}
            {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
            className="text-accent underline decoration-1 underline-offset-2"
            {...props}
          >
            {children}
          </a>
        );
      }
      return (
        <RouterLink
          to={destination(link.to) + (link.anchor ? "#" + link.anchor : "")}
          // Not an error: per the format a link may point at knowledge not yet
          // written, so it stays a link and is shown differently.
          title={link.exists ? undefined : "This entry does not exist yet"}
          className={
            link.exists
              ? "text-accent underline decoration-1 underline-offset-2"
              : "text-muted underline decoration-dotted underline-offset-2"
          }
        >
          {children}
        </RouterLink>
      );
    },

    // An image in the bundle is fetched over HTTP like any other image. The
    // only thing needed here is the address, which arrives resolved in the same
    // table as every other href; the browser does the rest.
    img({ src, alt, ...props }) {
      const asset = typeof src === "string" ? links.get(src)?.asset : undefined;
      return (
        <img
          src={asset ?? (typeof src === "string" ? src : undefined)}
          alt={alt ?? ""}
          loading="lazy"
          className="max-w-full rounded-md"
          {...props}
        />
      );
    },

    // The checkbox is matched through its list item, because remark-gfm gives
    // the <input> no position of its own.
    li({ children, ...props }) {
      const box = checkboxes.get(lineOf(props) ?? -1);
      if (!box) return <li>{children}</li>;
      return (
        <li className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={box.done}
            disabled={!onToggleCheckbox}
            onChange={() => onToggleCheckbox?.(box.line, !box.done)}
            aria-label={box.text}
            className="accent-accent mt-1.5 size-3.5 shrink-0 cursor-pointer disabled:cursor-default"
          />
          <span className={box.done ? "text-muted line-through" : undefined}>
            {stripRenderedCheckbox(children)}
          </span>
        </li>
      );
    },

    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
  };

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // lowlight ships 37 curated common grammars, which is the subset worth
        // having; passing more only adds to it. Anything unrecognized renders as
        // plain code rather than failing, so an omission costs colour, not a
        // page. Highlighting is ~173KB of the bundle: going below this set means
        // constructing a lowlight instance directly, which is worth doing only
        // if that number starts to matter.
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
        // Raw HTML is deliberately not enabled. These files are written by agents
        // and by anyone else with the folder, so passing their HTML through would
        // make every entry author an author of the UI.
      >
        {entry.body}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Drops the disabled <input> remark-gfm puts inside a task list item, since this
 * renders its own interactive one.
 */
function stripRenderedCheckbox(children: React.ReactNode): React.ReactNode {
  if (!Array.isArray(children)) return children;
  return children.filter(
    (c) => !(c && typeof c === "object" && "type" in c && (c as { type?: unknown }).type === "input"),
  );
}
