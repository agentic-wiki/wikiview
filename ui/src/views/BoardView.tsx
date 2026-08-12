import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Board, type Card, type Column, type TreeNode } from "@/api";
import { BoardSettings } from "@/views/BoardSettings";
import { useDrag } from "@/views/drag";
import { EntryView } from "@/views/EntryView";
import { Loading } from "@/views/Loading";
import { NewBoard } from "@/views/NewBoard";
import { NotFound } from "@/views/NotFound";

/**
 * One folder as columns of cards.
 *
 * The columns arrive built: which ones exist, what order they sit in, and which
 * card is in which are all decided by the server, where the config is already
 * decoded and `where` is already parsed. Nothing here re-derives any of it.
 */
export function BoardView({
  id,
  card,
  tree,
  changedAt,
  rootLabel,
  version,
  refresh,
}: {
  /** The board's id, which is the first segment of the address. */
  id: string;
  /** The entry open over it, or "" for none. Everything after the id. */
  card: string;
  /** The folder tree, for offering a board over one when this board is empty. */
  tree: TreeNode;
  /** When each entry.s content last moved, for the card opened over the board. */
  changedAt: Record<string, number>;
  rootLabel: string;
  version: number;
  refresh: number;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const ac = new AbortController();
    api
      .board(id, ac.signal)
      .then((b) => {
        if (!ac.signal.aborted) {
          setBoard(b);
          setError(null);
        }
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(String(e.message ?? e));
      });
    return () => ac.abort();
  }, [id, refresh]);

  // The board as committed, read by the drop handler, which runs from a pointer
  // event rather than from a render.
  const current = useRef<Board | null>(null);
  useEffect(() => {
    current.current = board;
  }, [board]);

  const { drag, handlers } = useDrag<Card>((card, to) => {
    const before = current.current;
    if (!before) return;
    // Optimistic, because a card that sits still for a round trip after you
    // dropped it reads as a drag that failed. The write bumps the version, the
    // refetch that follows is what the screen finally agrees with, and a card
    // that snaps back is telling you the truth arrived.
    setBoard(moved(before, card, to));
    api.moveCard(before.id, card.path, to, version).catch(() => setBoard(before));
  });

  /**
   * Dragging a column header to reorder the columns.
   *
   * Which pins every column, because order is a thing only config has: inference
   * gives you the columns that exist and nothing more. So this writes the whole
   * list in its new order, and the header says as much.
   */
  const reorder = useDrag<string>((value, onto) => {
    const before = current.current;
    if (!before || value === onto) return;
    const order = reordered(
      before.columns.map((c) => c.value),
      value,
      onto,
    );
    setBoard({ ...before, columns: order.map((v) => column(before, v)) });
    api
      .boardSettings(before.id, {
        name: before.name,
        status: before.field,
        lane: before.lane ?? "",
        where: before.where ?? [],
        columns: order.filter((v) => v !== ""),
      })
      .catch(() => setBoard(before));
  });

  if (error) return <NotFound path={"/kanban/" + id} hint="There is no board with that id" />;
  if (!board) return <Loading />;

  const cards = board.columns.reduce((n, c) => n + c.cards.length, 0);
  if (cards === 0) return <EmptyBoard board={board} tree={tree} rootLabel={rootLabel} />;

  // Every path this board holds, which is what decides whether a link inside a
  // card stays here or leaves for the reader.
  const onBoard = new Set(board.columns.flatMap((c) => c.cards.map((c) => c.path)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The board's own name, which nothing else on screen says: the breadcrumbs
          follow the reader's path and a board's address is an id. */}
      <header className="border-border flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <h1 className="text-fg truncate text-sm font-medium">{board.name}</h1>
        <span className="text-muted shrink-0 font-mono text-xs">{board.path}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-muted hover:text-fg hover:bg-fg/5 ml-auto shrink-0 rounded-md px-2 py-1 text-xs"
        >
          Settings
        </button>
      </header>

      {/* Columns scroll sideways as a set while each scrolls its own cards, so a
          long column does not push the board's own height around. */}
      <div className="flex min-h-0 min-w-0 grow gap-3 overflow-x-auto p-4">
        {board.columns.map((column) => (
          <BoardColumn
            key={column.value || " unset"}
            board={board.id}
            column={column}
            field={board.field}
            lane={board.lane}
            handlers={handlers}
            headerHandlers={reorder.handlers}
            dragging={drag?.item.path}
            over={(drag ?? reorder.drag)?.over === column.value}
          />
        ))}
      </div>

      {drag && <Ghost card={drag.item} x={drag.x} y={drag.y} />}
      {editing && <BoardSettings board={board} onClose={() => setEditing(false)} />}

      {card && (
        <CardSheet
          board={board.id}
          path={card}
          version={version}
          refresh={refresh}
          changedAt={changedAt[card]}
          onBoard={onBoard}
          // Replaced rather than pushed: closing a card should not leave a
          // history entry you have to press back through twice.
          onClose={() => navigate("/kanban/" + board.id, { replace: true })}
        />
      )}
    </div>
  );
}

/**
 * A board with nothing on it.
 *
 * Which is where a fresh bundle lands: `root` exists without configuring
 * anything, and in a bundle of notes it matches nothing. So this says why rather
 * than leaving a blank page, and then offers the thing that fixes it — a board
 * over a folder that does have tasks in it.
 *
 * The reason is worth spelling out because it is not guessable: a card is an
 * entry with `type: task`, and nothing on screen says so.
 */
function EmptyBoard({
  board,
  tree,
  rootLabel,
}: {
  board: Board;
  tree: TreeNode;
  rootLabel: string;
}) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <p className="text-fg font-medium">Nothing on this board</p>
          <p className="text-muted mt-1 text-sm">
            No entry under <code>{board.path}</code> is a <code>type: task</code> with a{" "}
            <code>{board.field}</code>.
          </p>
        </div>
        <div className="border-border rounded-lg border p-4">
          <p className="text-muted mb-3 text-sm">Point a board at a folder that has some:</p>
          <NewBoard tree={tree} rootLabel={rootLabel} />
        </div>
      </div>
    </div>
  );
}

function BoardColumn({
  board,
  column,
  field,
  lane,
  handlers,
  headerHandlers,
  dragging,
  over,
}: {
  /** The board id, which every card address starts with. */
  board: string;
  column: Column;
  field: string;
  lane?: string;
  handlers: (card: Card) => Record<string, unknown>;
  /** Dragging the header, which reorders the columns rather than moving a card. */
  headerHandlers: (value: string) => Record<string, unknown>;
  /** The path of the card being dragged, so its place is left showing. */
  dragging?: string;
  /** Whether a drop here is what would happen if the pointer let go now. */
  over: boolean;
}) {
  // Grouped here rather than by the server, because a lane is a way of reading
  // one column rather than a property of the board's contents: the cards and
  // their lane values are the data, and this is an arrangement of them.
  const lanes = useMemo(() => groupByLane(column.cards, lane), [column.cards, lane]);

  return (
    <section
      aria-label={column.value || `no ${field}`}
      // The column of entries with no status carries no target, so it takes no
      // drops: dropping there would mean *removing* the field, which is a
      // different operation wearing the same gesture.
      data-drop={column.value || undefined}
      className={[
        "flex w-72 shrink-0 flex-col rounded-lg border",
        over ? "border-accent bg-accent/5" : "bg-surface/40 border-border",
      ].join(" ")}
    >
      {/* Drag to reorder, except the unnamed column: it is not a status anybody
          declared, so there is no place for it in a list of declared ones. */}
      <header
        {...(column.value ? headerHandlers(column.value) : {})}
        title={
          column.value
            ? column.pinned
              ? "Pinned in wiki.toml. Drag to reorder."
              : "This column exists because entries have it. Drag to pin the order."
            : undefined
        }
        className={[
          "border-border flex items-baseline gap-2 border-b px-3 py-2",
          column.value ? "cursor-grab touch-none select-none" : "",
        ].join(" ")}
      >
        {/* An unnamed column is the one holding cards with no such field, which
            is a fact about them rather than a status anybody wrote. */}
        <h2 className="text-fg truncate text-sm font-medium">
          {column.value || <span className="text-muted italic">no {field}</span>}
        </h2>
        {/* A pinned column stays when its status stops being used; an inferred
            one vanishes with the last entry that had it. Showing them the same
            is what makes config feel haunted. */}
        {column.pinned && (
          <span className="text-accent shrink-0 text-xs" title="Pinned in wiki.toml">
            ●
          </span>
        )}
        <span className="text-muted ml-auto shrink-0 text-xs">{column.cards.length}</span>
      </header>

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-2">
        {column.cards.length === 0 && (
          // A declared column with nothing in it is the point of declaring it,
          // so it says so rather than looking broken.
          <p className="text-muted px-1 py-2 text-xs">Empty</p>
        )}
        {lanes.map(([name, cards]) => (
          <div key={name || " unset"} className="flex flex-col gap-2">
            {lane && (
              <h3 className="text-muted px-1 pt-1 text-xs font-medium tracking-wide uppercase">
                {name || "none"}
              </h3>
            )}
            {cards.map((card) => (
              <BoardCard
                key={card.path}
                board={board}
                card={card}
                handlers={handlers}
                dragging={card.path === dragging}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function BoardCard({
  board,
  card,
  handlers,
  dragging,
}: {
  board: string;
  card: Card;
  handlers: (card: Card) => Record<string, unknown>;
  dragging: boolean;
}) {
  return (
    // Opens beside the board rather than navigating away from it. A card is
    // something you look at while keeping the columns in view.
    //
    // `touch-none` because a touch drag has to be a drag: left to the browser it
    // scrolls the column instead, and there is then no way to move a card by
    // touch at all.
    <Link
      {...handlers(card)}
      to={cardHref(board, card.path)}
      className={[
        "border-border/70 bg-bg hover:border-muted/60 block touch-none rounded-md border p-2 transition-colors",
        // Left in place rather than removed, so the column does not reflow under
        // the pointer while you are deciding where to drop.
        dragging ? "opacity-40" : "",
      ].join(" ")}
    >
      <CardFace card={card} />
    </Link>
  );
}

function CardFace({ card }: { card: Card }) {
  return (
    <>
      <span className="text-fg block truncate text-sm">{card.label}</span>
      {/* What the entry calls itself, under the filename, when it says something
          the filename does not. */}
      {card.title && card.title !== card.label && (
        <span className="text-muted mt-0.5 block truncate text-xs">{card.title}</span>
      )}
    </>
  );
}

/**
 * The card under the pointer while it is being dragged.
 *
 * Drawn separately rather than by moving the card itself, so the column keeps
 * its layout and the card keeps the pointer capture the gesture depends on.
 * It takes no pointer events, or it would be the only thing ever found beneath
 * the cursor and every drop would land on itself.
 */
function Ghost({ card, x, y }: { card: Card; x: number; y: number }) {
  return (
    <div
      style={{ left: x, top: y }}
      className="border-accent bg-bg pointer-events-none fixed z-50 w-64 -translate-x-4 -translate-y-4 rotate-1 rounded-md border p-2 shadow-lg"
    >
      <CardFace card={card} />
    </div>
  );
}

/**
 * The board with one card in another column, before the server has said so.
 *
 * Only a rearrangement of what is already on screen: the card object is
 * unchanged, because a card carries no status of its own — the column it sits in
 * is what says one.
 */
function moved(board: Board, card: Card, to: string): Board {
  const columns = board.columns.map((c) => ({
    ...c,
    cards: c.cards.filter((x) => x.path !== card.path),
  }));
  const target = columns.find((c) => c.value === to);
  if (!target) return board;
  // Path order, which is the order the server puts cards in and the order the
  // filenames encode. Compared as plain strings for the same reason: a locale
  // comparison would land the card somewhere the next fetch disagrees with.
  target.cards = [...target.cards, card].sort((a, b) => (a.path < b.path ? -1 : 1));
  return { ...board, columns };
}

/**
 * One card's entry, opened over the board.
 *
 * A dialog rather than a side panel: a panel takes its width out of the columns
 * for as long as it is open, and the columns are what you came for. This
 * borrows the screen and gives it back, and the board stays visible around it,
 * which is the context you were reading the card in.
 */
function CardSheet({
  board,
  path,
  version,
  refresh,
  changedAt,
  onBoard,
  onClose,
}: {
  board: string;
  path: string;
  version: number;
  refresh: number;
  changedAt?: number;
  onBoard: Set<string>;
  onClose: () => void;
}) {
  // Escape closes, because a panel that only closes by finding its button is a
  // panel people leave open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The dialog scrolls its own body, so following a link from halfway down one
  // card into another would start you halfway down that one. The reader solves
  // this for the page; nothing was solving it here.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [path]);

  return (
    // Over the board rather than beside it. A panel takes its width from the
    // columns permanently, and the columns are the thing you came for; a dialog
    // borrows the screen and gives it back.
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={path}
        onClick={(e) => e.stopPropagation()}
        // A fixed height rather than one taken from the content. A card's entry
        // arrives a moment after the dialog does, and a dialog sized by its
        // contents is a header alone until it lands, then a jump. It would also
        // resize under you when a link inside one card opens another.
        className="border-border bg-bg flex h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl"
      >
        <header className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <span className="text-muted truncate font-mono text-xs">{path}</span>
          <Link
            to={"/wiki" + path}
            className="text-muted hover:text-fg ml-auto shrink-0 text-xs underline decoration-dotted underline-offset-2"
          >
            open in reader
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close card"
            className="text-muted hover:text-fg hover:bg-fg/5 grid size-7 shrink-0 place-items-center rounded-md"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div ref={body} className="min-h-0 grow overflow-y-auto">
          <EntryView
            path={path}
            version={version}
            refresh={refresh}
            changedAt={changedAt}
            // A link to something else on this board opens that card and keeps
            // the board. Anything else leaves for the reader, which is what
            // makes an off-board link ordinary rather than decorated.
            destination={(to) => (onBoard.has(to) ? cardHref(board, to) : "/wiki" + to)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The address of a card on a board: `/kanban/<id>/<entry path>`.
 *
 * The id is one segment and never a folder name, so everything after the first
 * slash is the bundle path — no separator to invent and nothing to guess. Each
 * segment is encoded the way an entry URL's are, which leaves the slashes
 * between them alone and escapes anything inside a name that would end the
 * path early.
 */
function cardHref(board: string, path: string): string {
  const segments = path.replace(/^\//, "").split("/").map(encodeURIComponent);
  return "/kanban/" + encodeURIComponent(board) + "/" + segments.join("/");
}

/** A list with one item moved to where another sits. */
function reordered(values: string[], move: string, onto: string): string[] {
  const rest = values.filter((v) => v !== move);
  const at = rest.indexOf(onto);
  if (at < 0) return values;
  return [...rest.slice(0, at), move, ...rest.slice(at)];
}

/** A board's column by its value, for rebuilding the board in a new order
 *  without refetching what is in each one. */
function column(board: Board, value: string): Column {
  return board.columns.find((c) => c.value === value)!;
}

/**
 * Cards grouped by their lane, in first-seen order, or one unnamed group when
 * the board has no lanes.
 *
 * A card missing the field gets its own group rather than joining another's,
 * for the same reason a status nobody declared still gets a column: a card that
 * quietly joins a group it does not belong to is worse than one that stands
 * apart.
 */
function groupByLane(cards: Card[], lane?: string): [string, Card[]][] {
  if (!lane) return [["", cards]];
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = card.lane ?? "";
    const existing = groups.get(key);
    if (existing) existing.push(card);
    else groups.set(key, [card]);
  }
  return [...groups];
}
