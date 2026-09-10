import type { Blockquote, Nodes, Root } from "mdast";

/**
 * Turns a callout into a labelled blockquote.
 *
 * ```md
 * > [!success] Shipped
 * > The write went through and the version moved.
 * ```
 *
 * Two dialects are in circulation and both turn up in bundles: GitHub's five
 * uppercase words, and Obsidian's much longer list, lowercase, with an optional
 * title and a `+`/`-` fold suffix. So **no set is enumerated** — any word counts,
 * and the handful worth a colour of their own get one in `index.css`. A list
 * here would mean someone's `> [!tldr]` rendering as leaked syntax until this
 * file is edited, which is the chronic work worth not creating.
 *
 * The marker is stripped from the text and the type and label ride out as data
 * attributes on the blockquote. Nodes are **mutated, never rebuilt**: `Markdown`
 * matches server-given headings and checkboxes by `node.position`, so a plugin
 * that replaced nodes would silently unhook every anchor and checkbox inside a
 * callout. Removing a text node moves nothing else.
 */
export function remarkCallout() {
  return (tree: Root) => {
    forEachBlockquote(tree, (quote) => {
      const paragraph = quote.children[0];
      if (paragraph?.type !== "paragraph") return;
      const text = paragraph.children[0];
      if (text?.type !== "text") return;

      const marker = MARKER.exec(text.value);
      if (!marker) return;

      text.value = text.value.slice(marker[0].length);
      if (!text.value) paragraph.children.shift();
      if (paragraph.children.length === 0) quote.children.shift();

      const type = marker[1]!.toLowerCase();
      const title = marker[2]!.trim();
      quote.data = {
        ...quote.data,
        hProperties: {
          ...quote.data?.hProperties,
          "data-callout": type,
          // A title formatted inline — `> [!note] **Shipped**` — is left in the
          // body and the type is labelled instead. Reading it would mean
          // rendering inline nodes into an attribute, and losing a word of a
          // title is cheaper than a second renderer.
          "data-callout-label": title || type.charAt(0).toUpperCase() + type.slice(1),
        },
      };
    });
  };
}

/**
 * `[!type]`, an optional fold suffix, an optional title, on the quote's first
 * line. The suffix is recognised only so it cannot end up inside the label:
 * folding is deliberately not implemented, since collapsed content is invisible
 * to ⌘F and to print.
 */
const MARKER = /^\[!([^\]\s]+)\][+-]?[ \t]*([^\n]*)(?:\n|$)/;

/** Every blockquote in the tree, nested ones included. */
function forEachBlockquote(node: Nodes, visit: (quote: Blockquote) => void) {
  if (node.type === "blockquote") visit(node);
  if ("children" in node) for (const child of node.children) forEachBlockquote(child, visit);
}
