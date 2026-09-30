import type { TreeNode } from "@/api";
import { find } from "@/tree";

/**
 * Every colour that says *where* something is, and nothing else picks one.
 *
 * Colour here is positional: a folder is coloured by its place among its
 * siblings, a tag by its place in the bundle's tag list, a column by its place
 * on the board. None of it is by meaning — the vocabulary belongs to the bundle,
 * and tinting `done` green would be the reader having an opinion about words it
 * was only asked to display. The one exception is `SHELVED`, below, asked for.
 *
 * Every function returns a CSS colour that reads the theme by itself (a token,
 * or a mix of two), so a caller puts it in a `style` and never branches on
 * light or dark. See backlog/8-design/003.
 */

/** How many categorical hues there are. A ninth thing repeats the first; its
 *  label is what tells the two apart. */
const HUES = 8;

/** What something with no position is drawn in: an entry directly in the view's
 *  folder, a tag the list has not caught up with, the column with no status. */
export const NEUTRAL = "var(--color-faint)";

function hue(index: number): string {
  return `var(--color-cat-${index % HUES})`;
}

/** A first-level folder under a view's root, and the colour it is drawn in. */
export interface Group {
  path: string;
  label: string;
  colour: string;
}

/**
 * The groups of a view: the child folders of `root`, in tree order, each
 * coloured by its position. `root` is "/" in the reader and a graph's `path` on
 * a graph. A root the tree does not have has no groups.
 */
export function groupsUnder(tree: TreeNode, root: string): Group[] {
  const node = find(tree, root);
  const children = node && "children" in node ? node.children : [];
  return children.map((c, i) => ({
    path: c.path,
    label: c.label ?? c.name,
    colour: hue(i),
  }));
}

/**
 * Which group a path belongs to: the first folder below the view's root on the
 * way to it. One level only, so a deep entry takes its first-level ancestor's
 * colour. Null for anything directly in the root, or outside it — a graph's
 * neighbour can live anywhere.
 */
export function groupOf(path: string, groups: Group[], root: string): Group | null {
  const base = root === "/" ? "" : root;
  if (!path.startsWith(base + "/")) return null;
  const rest = path.slice(base.length + 1).split("/");
  if (rest.length < 2) return null; // a file directly in the root
  const folder = base + "/" + rest[0];
  return groups.find((g) => g.path === folder) ?? null;
}

/** The colour of the group a path belongs to, neutral when it has none. */
export function groupColour(path: string, groups: Group[], root: string): string {
  return groupOf(path, groups, root)?.colour ?? NEUTRAL;
}

/**
 * A tag's colour: its position in the bundle's tag list, which the server builds
 * in first-appearance order. One tag is one colour on every surface. A tag the
 * list does not have yet — a write a moment ahead of the refetch — is neutral
 * until it arrives.
 */
export function tagColour(tag: string, tags: string[]): string {
  const i = tags.indexOf(tag);
  return i < 0 ? NEUTRAL : hue(i);
}

/**
 * Column values that mean "put away", drawn gray and left out of the gradient.
 * The one place colour follows a word, because the user asked for it: a shelf
 * at the end of a board is not the finish line the gradient's green says it is.
 * Matched case-insensitively. Adding a word is a one-line change.
 */
export const SHELVED = ["archived", "parked"];

export function isShelved(value: string): boolean {
  return SHELVED.includes(value.toLowerCase());
}

/** The four colours a board's live columns take, first to last. */
const STAGES = [0, 1, 2, 3].map((i) => `var(--color-stage-${i})`);

/**
 * A column's colour, by its place among the board's live columns: gray, blue,
 * amber, green, spread over them whatever their count. Shelved columns are gray
 * and take no step; the column with no status (value "") is neutral.
 *
 * Each column takes the **nearest stop**, never a blend. Blending was tried:
 * the midpoint of blue and amber is magenta round the hue wheel and beige in a
 * straight line, and either reads as a colour the gradient does not contain.
 * Snapping keeps every column one of the four, at the cost of neighbours
 * sharing one on a wide board: three columns are gray, amber, green; five are
 * gray, blue, amber, amber, green.
 */
export function columnColour(value: string, columns: string[]): string {
  if (value === "") return NEUTRAL;
  if (isShelved(value)) return STAGES[0]!;
  const live = columns.filter((c) => c !== "" && !isShelved(c));
  const i = live.indexOf(value);
  if (i < 0) return NEUTRAL;
  // One live column has no first or last; it sits at the first real colour
  // rather than at gray, which would read as shelved.
  const t = live.length === 1 ? 1 / 3 : i / (live.length - 1);
  return STAGES[Math.round(t * (STAGES.length - 1))]!;
}

/**
 * How many of a lane header's three bars are lit: the first lane three, the last
 * one, the rest spread between. Lanes take no hue — the glyph says rank by
 * position, which is all a lane's order means.
 */
export function laneBars(index: number, count: number): 1 | 2 | 3 {
  if (count <= 1) return 3;
  return Math.round(3 - (2 * index) / (count - 1)) as 1 | 2 | 3;
}

