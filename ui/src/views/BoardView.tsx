import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Board, type Card, type Column, type TreeNode } from "@/api";
import { BoardSettings } from "@/views/BoardSettings";
import { reordered, useDrag, type Drag as DragState } from "@/views/drag";
import { EntryView } from "@/views/EntryView";
import { Loading } from "@/views/Loading";
import { NewBoard } from "@/views/NewBoard";
import { NotFound } from "@/views/NotFound";
import type { Queue } from "@/queue";

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
  queue,
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
  /** The read-later queue, for the card opened over the board. */
  queue: Queue;
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
    // A drop says where in both directions at once, and the lane half is only
    // as good as the band it landed in: released over a column but not over one
    // of its bands, it says nothing about lanes and the card keeps the one it
    // had.
    const lane = to.lane ?? "";
    if (to.drop === columnOf(before, card) && lane === (card.lane ?? "")) return;
    // Optimistic, because a card that sits still for a round trip after you
    // dropped it reads as a drag that failed. The write bumps the version, the
    // refetch that follows is what the screen finally agrees with, and a card
    // that snaps back is telling you the truth arrived.
    setBoard(moved(before, card, to.drop, lane));
    api.moveCard(before.id, card.path, to.drop, lane, version).catch(() => setBoard(before));
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
    if (!before || value === onto.drop) return;
    const order = reordered(
      before.columns.map((c) => c.value),
      value,
      onto.drop,
    );
    setBoard({ ...before, columns: order.map((v) => column(before, v)) });
    api
      .boardSettings(before.id, {
        name: before.name,
        status: before.field,
        lane: before.lane ?? "",
        blockers: before.blockers ?? "",
        where: before.where ?? [],
        columns: order.filter((v) => v !== ""),
        lanes: (before.lanes ?? []).filter((l) => l !== ""),
      })
      .catch(() => setBoard(before));
  });

  if (error) return <NotFound path={"/kanban/" + id} hint="There is no board with that id" />;
  if (!board) return <Loading />;

  const cards = board.columns.reduce((n, c) => n + c.cards.length, 0);
  if (cards === 0) return <EmptyBoard board={board} tree={tree} rootLabel={rootLabel} />;

  // Every lane on the board, in the order the server put them in.
  const axis = board.lanes ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The board's own name, which nothing else on screen says: the breadcrumbs
          follow the reader's path and a board's address is an id. */}
      <header className="border-border flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <h1 className="text-fg truncate text-sm font-medium">{board.name}</h1>
        <span className="text-muted shrink-0 font-mono text-xs">{board.path}</span>
        <button
          type="button"
          data-print="hide"
          onClick={() => setEditing(true)}
          className="text-muted hover:text-fg hover:bg-fg/5 ml-auto shrink-0 rounded-md px-2 py-1 text-xs"
        >
          Settings
        </button>
      </header>

      {/* Columns scroll sideways as a set while each scrolls its own cards, so a
          long column does not push the board's own height around. Marked as the
          scroller so a drag towards the edge can bring the rest into reach.

          On paper, a card open over the board makes the board context you are
          not reading: what you are looking at is what prints. */}
      <div
        data-scroller
        data-print={card ? "hide" : undefined}
        className="bg-sunken flex min-h-0 min-w-0 grow gap-3 overflow-x-auto p-4"
      >
        {board.columns.map((column) => (
          <BoardColumn
            key={column.value || " unset"}
            board={board.id}
            column={column}
            field={board.field}
            lane={board.lane}
            handlers={handlers}
            headerHandlers={reorder.handlers}
            axis={axis}
            dragging={drag?.item.path}
            over={(drag ?? reorder.drag)?.over?.drop === column.value}
            overLane={drag?.over?.drop === column.value ? drag.over.lane : null}
          />
        ))}
      </div>

      {drag && <Ghost card={drag.item} drag={drag} />}
      {editing && <BoardSettings board={board} onClose={() => setEditing(false)} />}

      {card && (
        <CardSheet
          board={board.id}
          path={card}
          version={version}
          refresh={refresh}
          changedAt={changedAt[card]}
          folder={board.path}
          queue={queue}
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
        {/* A form is a control, and paper takes no input. */}
        <div data-print="hide" className="border-border rounded-lg border p-4">
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
  axis,
  dragging,
  over,
  overLane,
}: {
  /** The board id, which every card address starts with. */
  board: string;
  column: Column;
  field: string;
  lane?: string;
  handlers: (card: Card) => Record<string, unknown>;
  /** Dragging the header, which reorders the columns rather than moving a card. */
  headerHandlers: (value: string) => Record<string, unknown>;
  /** Every lane the board has, so a column can offer one it does not yet use. */
  axis: string[];
  /** The path of the card being dragged, so its place is left showing. */
  dragging?: string;
  /** Whether a drop here is what would happen if the pointer let go now. */
  over: boolean;
  /** The band within this column a drop would land in, when it would land in
   *  one, so a diagonal drag shows both halves of where it is going. */
  overLane?: string | null;
}) {
  // Grouped here rather than by the server, because a lane is a way of reading
  // one column rather than a property of the board's contents: the cards and
  // their lane values are the data, and this is an arrangement of them.
  //
  // Condensed while nothing is being dragged: a band with no cards is only there
  // to be dropped into, and a board of five lanes by five columns is otherwise
  // mostly headings for rows that hold nothing. They appear the moment a card is
  // in the air, which is the moment they mean something.
  const lanes = useMemo(
    () => groupByLane(column.cards, lane, axis).filter(([, cards]) => cards.length > 0 || dragging),
    [column.cards, lane, axis, dragging],
  );

  return (
    <section
      aria-label={column.value || `no ${field}`}
      // The column of entries with no status carries no target, so it takes no
      // drops: dropping there would mean *removing* the field, which is a
      // different operation wearing the same gesture.
      data-drop={column.value || undefined}
      className={[
        "flex w-72 shrink-0 flex-col rounded-lg border",
        over ? "border-accent bg-accent/8 elev-2" : "bg-surface border-border elev-1",
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
          "border-border bg-fg/2 flex items-baseline gap-2 rounded-t-lg border-b px-3 py-2",
          column.value ? "cursor-grab touch-none select-none" : "",
        ].join(" ")}
      >
        {/* An unnamed column is the one holding cards with no such field, which
            is a fact about them rather than a status anybody wrote. */}
        <h2 className="text-fg caps truncate text-xs font-semibold">
          {column.value ? heading(column.value) : <span className="text-muted italic">no {field}</span>}
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
          <div
            key={name || " unset"}
            // A band is a drop target of its own, so one diagonal drag says both
            // which column and which lane. The unnamed band carries none, for
            // the same reason the unnamed column does: dropping into it would
            // mean removing the field.
            data-lane={lane && name ? name : undefined}
            className={[
              "flex shrink-0 flex-col gap-2 rounded-md",
              lane ? "p-1" : "",
              // An empty band is only there to be aimed at, so it is drawn as a
              // place rather than as a row that happens to hold nothing.
              lane && cards.length === 0 ? "border-border/60 min-h-10 border border-dashed" : "",
              lane && name && overLane === name ? "bg-accent/10" : "",
            ].join(" ")}
          >
            {lane && (
              <h3 className="text-muted caps px-1 pt-1 text-xs font-medium">
                {name ? heading(name) : "none"}
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
    // `draggable={false}` because this is an anchor, and an anchor is draggable
    // by default: the browser starts its own link-drag on the first movement and
    // stops sending pointer events, so no drag of ours ever began. Invisible to
    // a test, since a DOM without a renderer has no native drag to start.
    //
    // `shrink-0` because a flex child shrinks below its content by default, and
    // a column with more cards than height then draws them over each other.
    <Link
      {...handlers(card)}
      draggable={false}
      to={cardHref(board, card.path)}
      className={[
        "border-border bg-surface elev-1 lift hover:border-accent/50 block shrink-0 rounded-md border p-2",
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
  const blockedBy = card.blockedBy ?? 0;
  const blocks = card.blocks ?? 0;
  // Capped, because a card is a glance and a tag cloud is not one. The rest are
  // counted rather than dropped, so a card never understates what it carries.
  const tags = card.tags ?? [];
  const shown = tags.slice(0, 3);
  return (
    <>
      <span className="text-fg block truncate text-sm">{card.label}</span>
      {/* What the entry calls itself, under the filename, when it says something
          the filename does not. */}
      {card.title && card.title !== card.label && (
        <span className="text-muted mt-0.5 block truncate text-xs">{card.title}</span>
      )}
      {/* Two opposite facts, so two badges: being blocked is a reason not to
          start and blocking others is a reason to, and one mark would say
          neither. Absent at zero, since a card with no edges has nothing to
          report and a row of noughts on every card says nothing. */}
      {(blockedBy > 0 || blocks > 0 || tags.length > 0) && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {blockedBy > 0 && (
            <Badge
              count={blockedBy}
              className="text-warn"
              title={`Waiting on ${blockedBy} ${blockedBy === 1 ? "entry" : "entries"}`}
            >
              {/* A barred circle: the universal "blocked" mark. */}
              <circle cx="8" cy="8" r="6.25" />
              <path d="M3.75 12.25 12.25 3.75" />
            </Badge>
          )}
          {blocks > 0 && (
            <Badge
              count={blocks}
              className="text-accent"
              title={`Holding up ${blocks} ${blocks === 1 ? "entry" : "entries"}`}
            >
              {/* An arrow branching outward, pointing away rather than at, so the
                  two read as opposites at a glance. */}
              <path d="M2.75 8h6.5m0 0L6.5 5.25M9.25 8 6.5 10.75M12.5 3.25v9.5" />
            </Badge>
          )}
          {shown.map((tag) => (
            <span
              key={tag}
              className="border-border text-muted rounded border px-1.5 py-0.5 text-xs"
            >
              {tag}
            </span>
          ))}
          {tags.length > shown.length && (
            <span className="text-muted text-xs">+{tags.length - shown.length}</span>
          )}
        </span>
      )}
    </>
  );
}

function Badge({
  count,
  title,
  className,
  children,
}: {
  count: number;
  title: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={["bg-fg/5 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs", className].join(" ")}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
      {count}
    </span>
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
function Ghost({ card, drag }: { card: Card; drag: DragState<Card> }) {
  return (
    <div
      // Offset by where the card was grabbed and sized as it was, so it sits
      // under the pointer exactly where it was picked up rather than jumping to
      // a corner the moment it lifts.
      style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }}
      data-print="hide"
      className="border-accent bg-surface elev-3 pointer-events-none fixed z-50 rotate-2 rounded-md border p-2"
    >
      <CardFace card={card} />
    </div>
  );
}

/**
 * The board with one card moved, before the server has said so.
 *
 * The column it sits in is what says its status, so that half is a
 * rearrangement. Its lane is on the card, so that half is an edit to it — and
 * an empty lane is one the drop did not name, which leaves the card's alone.
 */
function moved(board: Board, card: Card, to: string, lane: string): Board {
  const carried = lane === "" ? card : { ...card, lane };
  const columns = board.columns.map((c) => ({
    ...c,
    cards: c.cards.filter((x) => x.path !== card.path),
  }));
  const target = columns.find((c) => c.value === to);
  if (!target) return board;
  // Path order, which is the order the server puts cards in and the order the
  // filenames encode. Compared as plain strings for the same reason: a locale
  // comparison would land the card somewhere the next fetch disagrees with.
  target.cards = [...target.cards, carried].sort((a, b) => (a.path < b.path ? -1 : 1));
  return { ...board, columns };
}

/** The column a card is currently in, so a drop that changes nothing does
 *  nothing rather than writing what is already there. */
function columnOf(board: Board, card: Card): string | undefined {
  return board.columns.find((c) => c.cards.some((x) => x.path === card.path))?.value;
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
  folder,
  queue,
  onClose,
}: {
  board: string;
  path: string;
  version: number;
  refresh: number;
  changedAt?: number;
  /** The folder this board covers, which is what decides whether a link from the
   *  card stays here or leaves for the reader. */
  folder: string;
  queue: Queue;
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
      // On paper the backdrop is a grey rectangle and a fixed box prints one
      // clipped page, so the sheet stops being a sheet and becomes the page.
      data-print="sheet"
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
        className="border-border bg-surface elev-3 flex h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border"
      >
        <header className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <span className="text-muted truncate font-mono text-xs">{path}</span>
          <Link
            to={"/wiki" + path}
            data-print="hide"
            className="text-muted hover:text-fg ml-auto shrink-0 text-xs underline decoration-dotted underline-offset-2"
          >
            open in reader
          </Link>
          <button
            type="button"
            onClick={onClose}
            data-print="hide"
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
            destination={(to) => (within(folder, to) ? cardHref(board, to) : "/wiki" + to)}
            queued={queue.queued.has(path)}
            onQueue={() => queue.toggle(path)}
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
/**
 * Whether a bundle path is inside the folder a board covers.
 *
 * This is what "on this board" means for following a link, and being a *card* was
 * too narrow a test for it. A folder's own `index.md` is not a task, so it is
 * never a card, and it is the front door of the very folder the board is over:
 * leaving the board to read it was the bug. A task the board's filter excludes is
 * the same story — `where` decides which entries get columns, not which entries
 * belong to the folder.
 *
 * A board over `/` covers the whole bundle, so from one of its cards nothing is
 * outside and every link opens as a sheet. That is the rule holding rather than
 * failing: the way out is Escape, the rail, or "open in reader", all of which the
 * sheet already has.
 */
function within(folder: string, path: string): boolean {
  if (folder === "/") return true;
  return path === folder || path.startsWith(folder + "/");
}

function cardHref(board: string, path: string): string {
  const segments = path.replace(/^\//, "").split("/").map(encodeURIComponent);
  return "/kanban/" + encodeURIComponent(board) + "/" + segments.join("/");
}

/** A list with one item moved to where another sits. */

/** A board's column by its value, for rebuilding the board in a new order
 *  without refetching what is in each one. */
function column(board: Board, value: string): Column {
  return board.columns.find((c) => c.value === value)!;
}

/**
 * Cards grouped by their lane, or one unnamed group when the board has no lanes.
 *
 * A card missing the field gets its own group rather than joining another's,
 * for the same reason a status nobody declared still gets a column: a card that
 * quietly joins a group it does not belong to is worse than one that stands
 * apart.
 */
function groupByLane(cards: Card[], lane: string | undefined, axis: string[]): [string, Card[]][] {
  if (!lane) return [["", cards]];
  return axis.map((name) => [name, cards.filter((c) => (c.lane ?? "") === name)]);
}

/**
 * A frontmatter value as a heading.
 *
 * Separators become spaces and CSS makes it capitals, so `in-progress` reads as
 * IN PROGRESS. Display only: the value itself is data, and the settings form
 * still shows it exactly as the entries spell it, because that is what gets
 * written back.
 */
function heading(value: string): string {
  return value.replace(/[-_]+/g, " ");
}
