import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { api, type Board, type Card, type Column, type TreeNode } from "@/api";
import { BoardSettings } from "@/views/BoardSettings";
import { reordered, useDrag, type Drag as DragState } from "@/views/drag";
import { CardSheet, sheetHref } from "@/views/CardSheet";
import { Loading } from "@/views/Loading";
import { NewView } from "@/views/NewView";
import { NotFound } from "@/views/NotFound";
import type { Queue } from "@/queue";
import { useBundle } from "@/bundle";
import { useToast } from "@/ui/Toast";
import { NARROW, useMedia } from "@/media";
import { columnColour, isShelved, laneBars, tagColour } from "@/colour";
import { useBundleState } from "@/state";
import { SearchField } from "@/ui/SearchField";
import { State, StateIcon } from "@/ui/State";
import { Segmented } from "@/ui/Segmented";
import { SettingsButton } from "@/ui/SettingsButton";
import { count } from "@/count";

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
  const location = useLocation();
  const { bundle } = useBundle();
  const toast = useToast();
  // On a narrow screen a column is most of the width and the board snaps
  // column to column, since dragging a view sideways is what a thumb does.
  const narrow = useMedia(NARROW);
  // The filter lives in the address, so it survives a card opening over the
  // board and a reload, and a filtered board is a link you can send.
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const setQuery = (q: string) =>
    setParams((p) => {
      if (q) p.set("q", q);
      else p.delete("q");
      return p;
    }, { replace: true });
  // Flat is a way of reading this board, kept per board and per bundle, and
  // never written to its config.
  const [flat, setFlat] = useBundleState(bundle.id, "board:" + id + ":flat", false);

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

  /**
   * Moving a card: to a column, and to a lane, or "" to keep the one it has.
   * The one way a card moves, whether it was dropped or chosen in its sheet.
   *
   * Optimistic, because a card that sits still for a round trip after you moved
   * it reads as a move that failed. The write bumps the version, the refetch
   * that follows is what the screen finally agrees with, and a card that snaps
   * back is telling you the truth arrived.
   */
  const move = (card: Card, column: string, lane: string) => {
    const before = current.current;
    if (!before) return;
    // Nothing to write when nothing changes: the same column, and a lane that
    // is the card's own or unnamed.
    if (column === columnOf(before, card) && (lane === "" || lane === (card.lane ?? ""))) return;
    setBoard(moved(before, card, column, lane));
    const to = heading(column) + (lane && lane !== (card.lane ?? "") ? " · " + heading(lane) : "");
    api
      .moveCard(before.id, card.path, column, lane, version)
      .then(() => toast("Moved to " + to))
      .catch((e) => {
        setBoard(before);
        toast(String((e as Error).message ?? e), "danger");
      });
  };

  // A drop says where in both directions at once, and the lane half is only as
  // good as the band it landed in: released over a column but not over one of
  // its bands, it says nothing about lanes and the card keeps the one it had.
  const { drag, handlers } = useDrag<Card>((card, to) => move(card, to.drop, to.lane ?? ""));

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
  const lanesOn = Boolean(board.lane) && !flat;
  const q = query.trim().toLowerCase();
  const shown = q
    ? board.columns.map((c) => ({ ...c, cards: c.cards.filter((card) => matches(card, q)) }))
    : board.columns;
  const visible = shown.reduce((n, c) => n + c.cards.length, 0);
  const values = board.columns.map((c) => c.value);
  // The filter rides along into a card's address and back out of it, so opening
  // a card does not throw away the narrowing you opened it from.
  const search = location.search;

  // The card open in the sheet, and its status and lane as controls there: the
  // same move a drop makes, for when the board is not where your hands are.
  const opened = card ? board.columns.flatMap((c) => c.cards).find((c) => c.path === card) : undefined;
  const openedIn = opened ? (columnOf(board, opened) ?? "") : "";
  const properties = opened
    ? [
        {
          key: board.field,
          value: openedIn,
          node: (
            <Choice
              label={board.field}
              options={values.filter((v) => v !== "").map((v) => ({ value: v, text: heading(v), colour: columnColour(v, values) }))}
              value={openedIn}
              onPick={(v) => move(opened, v, "")}
            />
          ),
        },
        ...(board.lane
          ? [
              {
                key: board.lane,
                value: opened.lane ?? "",
                node: (
                  <Choice
                    label={board.lane}
                    options={axis.filter((l) => l !== "").map((l) => ({ value: l, text: heading(l) }))}
                    value={opened.lane ?? ""}
                    // A card with no status has no column to stay in while its
                    // lane changes, so its lane waits until it has one.
                    disabled={openedIn === ""}
                    onPick={(l) => move(opened, openedIn, l)}
                  />
                ),
              },
            ]
          : []),
      ]
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The board's own name, which the trail says too, but here beside what
          it covers and how much is on it. */}
      <header className="border-line flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-3.5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="text-fg truncate text-lg font-semibold tracking-tight">{board.name}</h1>
          <span className="text-faint shrink-0 font-mono text-xs">
            {board.path} · {q ? `${visible} of ${count(cards, "card")}` : count(cards, "card")}
          </span>
        </div>
        <div className="flex-1" />
        <div data-print="hide" className="flex flex-wrap items-center gap-2">
          <SearchField label="Filter cards" placeholder="Filter cards or tags" value={query} onChange={setQuery} />
          {/* Only a board with lanes has lanes to flatten. A reading of the
              board, not a change to it: config is untouched. */}
          {board.lane && (
            <Segmented
              label="Lanes"
              options={[
                ["lanes", "Lanes"],
                ["flat", "Flat"],
              ]}
              value={flat ? "flat" : "lanes"}
              onChange={(v) => setFlat(v === "flat")}
            />
          )}
          <SettingsButton onClick={() => setEditing(true)} />
        </div>
      </header>

      {/* Columns scroll sideways as a set while each scrolls its own cards, so a
          long column does not push the board's own height around. Marked as the
          scroller so a drag towards the edge can bring the rest into reach.

          On paper, a card open over the board makes the board context you are
          not reading: what you are looking at is what prints. */}
      {/* The sheet floats over this area, below the view's header, so the
          header's controls stay in reach while a card or node is open. */}
      <div className="relative flex min-h-0 min-w-0 grow">
        <div
          data-scroller
          data-print={card ? "hide" : undefined}
          className={[
          "bg-bg flex min-h-0 min-w-0 grow items-start gap-3.5 overflow-x-auto px-5 pt-4.5 pb-6",
          narrow ? "snap-x snap-mandatory" : "",
        ].join(" ")}
        >
          {shown.map((column) => (
            <BoardColumn
              key={column.value || " unset"}
              board={board.id}
              column={column}
              field={board.field}
              lane={lanesOn ? board.lane : undefined}
              colour={columnColour(column.value, values)}
            narrow={narrow}
              share={visible ? column.cards.length / visible : 0}
              filtering={q !== ""}
              search={search}
              open={card}
              handlers={handlers}
              headerHandlers={reorder.handlers}
              axis={axis}
              dragging={drag?.item.path}
              // A card over this column: with lanes, the band it will land in
              // (the one under the pointer, else its own), and not the column
              // around it; without lanes, the column.
              over={drag?.over?.drop === column.value && !lanesOn}
              overLane={
                drag?.over?.drop === column.value && lanesOn ? (drag.over.lane ?? drag.item.lane ?? "") : null
              }
              // A column being dragged: it stays where it was, dimmed, and the
              // column it would land before carries a line on its left.
              lifted={reorder.drag?.item === column.value}
              landsBefore={reorder.drag !== null && reorder.drag.item !== column.value && reorder.drag.over?.drop === column.value}
            />
          ))}
        </div>
        {card && (
          <CardSheet
            path={card}
            version={version}
            refresh={refresh}
            changedAt={changedAt[card]}
            queue={queue}
            // A link to something else in this board's folder opens that card and
            // keeps the board. Anything else leaves for the reader, which is what
            // makes an off-board link ordinary rather than decorated.
            destination={(to) => (within(board.path, to) ? cardHref(board.id, to) + search : "/wiki" + to)}
            hrefFor={(to) => cardHref(board.id, to) + search}
            properties={properties}
            hint="Changes write to the card's frontmatter"
            // Replaced rather than pushed: closing a card should not leave a
            // history entry you have to press back through twice.
            onClose={() => navigate("/kanban/" + board.id + search, { replace: true })}
          />
        )}
      </div>

      {drag && <Ghost card={drag.item} drag={drag} />}
      {reorder.drag && (
        <ColumnGhost
          column={column(board, reorder.drag.item)}
          colour={columnColour(reorder.drag.item, values)}
          drag={reorder.drag}
        />
      )}
      {editing && <BoardSettings board={board} onClose={() => setEditing(false)} />}

    </div>
  );
}

/**
 * Whether a card answers to a filter: its title, its filename, or one of its
 * tags, containing the text. Client-side and plain, because it narrows what is
 * already on screen — the board's own `where` is the query language.
 */
function matches(card: Card, q: string): boolean {
  return (
    (card.title ?? "").toLowerCase().includes(q) ||
    card.label.toLowerCase().includes(q) ||
    (card.tags ?? []).some((t) => t.toLowerCase().includes(q))
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
    <State
      icon={StateIcon.board}
      title="Nothing on this board"
      detail={
        <>
          No entry under <code>{board.path}</code> is a <code>type: task</code> with a <code>{board.field}</code>.
        </>
      }
      action={
        // A form is a control, and paper takes no input.
        <div data-print="hide" className="border-line bg-panel-2 rounded-xl border p-4 text-left">
          <p className="text-muted mb-3 text-[13px]">Point a board at a folder that has some:</p>
          <NewView kind="board" tree={tree} rootLabel={rootLabel} />
        </div>
      }
    />
  );
}

function BoardColumn({
  board,
  column,
  field,
  lane,
  colour,
  share,
  filtering,
  search,
  open,
  handlers,
  headerHandlers,
  axis,
  dragging,
  over,
  overLane,
  narrow,
  lifted,
  landsBefore,
}: {
  /** This column is the one being dragged to a new place. */
  lifted: boolean;
  /** Dropping the column being dragged would put it just before this one. */
  landsBefore: boolean;
  /** Most of the screen wide, and a place a sideways swipe stops at. */
  narrow: boolean;
  /** The board id, which every card address starts with. */
  board: string;
  column: Column;
  field: string;
  /** The lane field, when lanes are being drawn: absent on a flat reading. */
  lane?: string;
  /** Its place on the board, as a colour (backlog/8-design/003). */
  colour: string;
  /** Its share of the cards on screen, for the bar in its header. */
  share: number;
  /** Whether a filter is narrowing the board, which changes what empty means. */
  filtering: boolean;
  /** The query string, carried into each card's address. */
  search: string;
  /** The card open over the board, "" for none. */
  open: string;
  handlers: (card: Card) => Record<string, unknown>;
  /** Dragging the header, which reorders the columns rather than moving a card. */
  headerHandlers: (value: string) => Record<string, unknown>;
  /** Every lane the board has, so a column can offer one it does not yet use. */
  axis: string[];
  /** The path of the card being dragged, so its place is left showing. */
  dragging?: string;
  /** A card dropped now would land in this column, on a board without lanes. */
  over: boolean;
  /** The band a card dropped now would land in, on a board with lanes ("" is
   *  the band of cards with none); null when it would not land here. */
  overLane?: string | null;
}) {
  // Grouped here rather than by the server, because a lane is a way of reading
  // one column rather than a property of the board's contents.
  //
  // Condensed while nothing is being dragged: a band with no cards is only there
  // to be dropped into. They appear the moment a card is in the air, which is
  // the moment they mean something.
  const lanes = useMemo(
    () => groupByLane(column.cards, lane, axis).filter(([, cards]) => cards.length > 0 || dragging),
    [column.cards, lane, axis, dragging],
  );
  // Rank by position among the named lanes; the band of cards with no lane has
  // no rank, so none of its bars are lit.
  const named = axis.filter((l) => l !== "");

  return (
    <section
      aria-label={column.value || `no ${field}`}
      // The column of entries with no status carries no target, so it takes no
      // drops: dropping there would mean *removing* the field, which is a
      // different operation wearing the same gesture.
      data-drop={column.value || undefined}
      className={[
        "bg-panel-2 flex max-h-full shrink-0 flex-col rounded-[14px] border",
        narrow ? "w-[84vw] snap-start" : "w-[316px]",
        over ? "border-accent" : "border-line",
        lifted ? "opacity-40" : "",
        landsBefore ? "shadow-[-8px_0_0_-5px_var(--color-accent)]" : "",
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
          "flex items-center gap-2.5 rounded-t-[14px] px-3.5 pt-3 pb-2.5",
          column.value ? "cursor-grab touch-none select-none" : "",
        ].join(" ")}
      >
        {/* The colour as a custom property, which the dot, its halo and the
            share bar all read: one value, however it is spelt. */}
        <span
          aria-hidden
          className="size-[9px] shrink-0 rounded-full bg-(--c) shadow-[0_0_0_3px_color-mix(in_oklch,var(--c)_20%,transparent)]"
          style={{ "--c": colour } as React.CSSProperties}
        />
        {/* The value as entries spell it, sentence-cased by CSS alone: the text
            is still the value, which is what gets written back. */}
        <h2 className="text-fg truncate text-[13.5px] font-semibold first-letter:uppercase">
          {column.value ? heading(column.value) : <span className="text-muted italic">no {field}</span>}
        </h2>
        {/* A pinned column stays when its status stops being used; an inferred
            one vanishes with the last entry that had it. Showing them the same
            is what makes config feel haunted. */}
        {column.pinned && (
          <span className="text-faint shrink-0 text-[9px]" title="Pinned in wiki.toml">
            ●
          </span>
        )}
        <span className="text-faint shrink-0 font-mono text-[11.5px]">{column.cards.length}</span>
        <div className="flex-1" />
        {/* How much of the board sits here, at a glance across the columns. */}
        <div className="bg-line h-1 w-11 shrink-0 overflow-hidden rounded-sm" aria-hidden>
          <div className="h-full bg-(--c)" style={{ width: `${Math.round(share * 100)}%`, "--c": colour } as React.CSSProperties} />
        </div>
      </header>

      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {column.cards.length === 0 && !dragging && (
          // A declared column with nothing in it is the point of declaring it,
          // so it says so rather than looking broken.
          <p className="text-faint px-1.5 py-2 text-xs">{filtering ? "No cards match" : "Empty"}</p>
        )}
        {lanes.map(([name, cards]) => {
          const target = Boolean(lane && name);
          return (
            <div
              key={name || " unset"}
              // A band is a drop target of its own, so one diagonal drag says
              // both which column and which lane. The unnamed band carries none,
              // for the same reason the unnamed column does.
              data-lane={target ? name : undefined}
              className={[
                "flex shrink-0 flex-col gap-1.5 rounded-[10px] p-1 outline-[1.5px] -outline-offset-1",
                lane && overLane === name ? "bg-accent-bg outline-accent outline-dashed" : "outline-transparent",
              ].join(" ")}
            >
              {lane && (
                <div className="text-faint flex items-center gap-2 px-1.5 pt-1.5 text-[10.5px]">
                  <Bars lit={name ? laneBars(named.indexOf(name), named.length) : 0} />
                  <h3 className="caps font-semibold">{name ? heading(name) : "none"}</h3>
                  <span className="font-mono">{cards.length}</span>
                </div>
              )}
              {cards.map((card) => (
                <BoardCard
                  key={card.path}
                  board={board}
                  card={card}
                  search={search}
                  handlers={handlers}
                  dragging={card.path === dragging}
                  open={card.path === open}
                  shelved={isShelved(column.value)}
                />
              ))}
              {/* An empty band is only there to be aimed at, so it is drawn as a
                  place rather than as a row that happens to hold nothing. */}
              {cards.length === 0 && (
                <div className="border-line-2 text-faint grid h-9.5 place-items-center rounded-lg border border-dashed text-xs">
                  Drop here
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * One of a few values, as a row of small buttons with the current one raised:
 * a card's status or lane in its sheet. Choosing one moves the card.
 */
function Choice({
  label,
  options,
  value,
  onPick,
  disabled = false,
}: {
  label: string;
  options: { value: string; text: string; colour?: string }[];
  value: string;
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => value !== o.value && onPick(o.value)}
          className={[
            "text-fg flex h-6.5 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12.5px] first-letter:uppercase disabled:opacity-40",
            value === o.value ? "bg-elev border-line-2" : "hover:bg-fg/5 border-transparent",
          ].join(" ")}
        >
          {o.colour && (
            <span
              aria-hidden
              className="size-[7px] rounded-full bg-(--c)"
              style={{ "--c": o.colour } as React.CSSProperties}
            />
          )}
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** The reference's rank glyph: three bars, the first `lit` of them drawn. */
function Bars({ lit }: { lit: number }) {
  // Strongest lanes in the text colour, the middle in muted, the last in faint:
  // a rank you read at a glance down the column, without a hue.
  const ink = lit === 3 ? "bg-fg" : lit === 2 ? "bg-muted" : "bg-faint";
  return (
    <span className="flex gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={["h-2.5 w-[3px] rounded-[1px]", i < lit ? ink : "bg-line-2"].join(" ")} />
      ))}
    </span>
  );
}

function BoardCard({
  board,
  card,
  search,
  handlers,
  dragging,
  open,
  shelved,
}: {
  /** In a shelved column, where what a card waits on no longer matters. */
  shelved: boolean;
  board: string;
  card: Card;
  search: string;
  handlers: (card: Card) => Record<string, unknown>;
  dragging: boolean;
  /** Open in the sheet over the board, so it is the card you are reading. */
  open: boolean;
}) {
  return (
    // Opens beside the board rather than navigating away from it. A card is
    // something you look at while keeping the columns in view.
    //
    // `draggable={false}` because this is an anchor, and an anchor is draggable
    // by default: the browser starts its own link-drag on the first movement and
    // stops sending pointer events, so no drag of ours ever began.
    //
    // `shrink-0` because a flex child shrinks below its content by default, and
    // a column with more cards than height then draws them over each other.
    <Link
      {...handlers(card)}
      draggable={false}
      to={cardHref(board, card.path) + search}
      aria-current={open ? "true" : undefined}
      className={[
        "bg-elev border-line hover:border-line-2 block shrink-0 rounded-[10px] border px-3 pt-[11px] pb-2.5 transition-[border-color,transform] hover:-translate-y-px",
        open ? "ring-accent ring-[1.5px]" : "",
        // Left in place rather than removed, so the column does not reflow under
        // the pointer while you are deciding where to drop.
        dragging ? "opacity-35" : "",
      ].join(" ")}
    >
      <CardFace card={card} shelved={shelved} />
    </Link>
  );
}

function CardFace({ card, shelved = false }: { card: Card; shelved?: boolean }) {
  const { bundle } = useBundle();
  const blockedBy = card.blockedBy ?? 0;
  const blocks = card.blocks ?? 0;
  const links = card.links ?? 0;
  // Capped, because a card is a glance and a tag cloud is not one. The rest are
  // counted rather than dropped, so a card never understates what it carries.
  const tags = card.tags ?? [];
  const shown = tags.slice(0, 3);
  return (
    <>
      {/* What the entry calls itself, and the filename under it when that says
          something else: a board is a wall of labels, and a label is what the
          entry gives itself (backlog/4-boards/008). */}
      <span className="text-fg mb-0.5 block text-[13.5px] leading-[1.35] font-medium">
        {card.title || card.label}
      </span>
      {card.title && card.title !== card.label && (
        <span className="text-muted line-clamp-2 block text-[12.5px] leading-[1.45]">{card.label}</span>
      )}
      {/* What it waits on, by name: the first blocker the field lists, and how
          many more. The same edges the count always reported, no verdict about
          whether they are finished — nothing here knows which status means
          done. */}
      {/* Amber, not red: waiting is a state to notice, not a failure. Not on a
          shelf — archived or parked, what it waits on no longer matters. */}
      {blockedBy > 0 && !shelved && (
        <span
          className="text-warn mt-2 flex min-w-0 items-center gap-1.5 text-[11.5px]"
          title={`Waiting on ${blockedBy} ${blockedBy === 1 ? "entry" : "entries"}`}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" className="shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M5.6 5.6l12.8 12.8" />
          </svg>
          <span className="truncate">Waiting on {card.blocker || count(blockedBy, "entry", "entries")}</span>
          {blockedBy > 1 && card.blocker && <span className="shrink-0">+{blockedBy - 1}</span>}
        </span>
      )}
      {(tags.length > 0 || blocks > 0 || links > 0) && (
        <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {shown.map((tag) => (
            <span
              key={tag}
              className="bg-panel-2 text-muted inline-flex h-5 items-center gap-1.5 rounded-[5px] px-1.5 text-[11.5px]"
            >
              <span className="size-1.5 rounded-full" style={{ background: tagColour(tag, bundle.tags) }} aria-hidden />
              {tag}
            </span>
          ))}
          {tags.length > shown.length && <span className="text-faint text-xs">+{tags.length - shown.length}</span>}
          <span className="flex-1" />
          {/* The opposite fact to waiting: others wait on this one, a reason
              to start it. An arrow branching outward, pointing away. */}
          {blocks > 0 && (
            <span
              className="text-accent-ink flex items-center gap-1 font-mono text-[11px]"
              title={`Holding up ${blocks} ${blocks === 1 ? "entry" : "entries"}`}
            >
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2.75 8h6.5m0 0L6.5 5.25M9.25 8 6.5 10.75M12.5 3.25v9.5" />
              </svg>
              {blocks}
            </span>
          )}
          {links > 0 && (
            <span className="text-faint flex items-center gap-1 font-mono text-[11px]" title={count(links, "linked entry", "linked entries")}>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
              </svg>
              {links}
            </span>
          )}
        </span>
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
function Ghost({ card, drag }: { card: Card; drag: DragState<Card> }) {
  return (
    <div
      // Offset by where the card was grabbed and sized as it was, so it sits
      // under the pointer exactly where it was picked up rather than jumping to
      // a corner the moment it lifts.
      style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }}
      data-print="hide"
      className="border-accent bg-elev shadow-float pointer-events-none fixed z-50 rotate-2 rounded-[10px] border px-3 pt-[11px] pb-2.5"
    >
      <CardFace card={card} />
    </div>
  );
}

/**
 * The column under the pointer while it is being dragged: its header, and
 * enough of a column under it to read as one, so the gesture has weight the
 * way a dragged card does.
 */
function ColumnGhost({ column, colour, drag }: { column: Column; colour: string; drag: DragState<string> }) {
  return (
    <div
      style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }}
      data-print="hide"
      className="border-accent bg-panel-2 shadow-float pointer-events-none fixed z-50 rotate-1 rounded-[14px] border"
    >
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
        <span
          aria-hidden
          className="size-[9px] shrink-0 rounded-full bg-(--c)"
          style={{ "--c": colour } as React.CSSProperties}
        />
        <span className="text-fg truncate text-[13.5px] font-semibold first-letter:uppercase">{heading(column.value)}</span>
        <span className="text-faint font-mono text-[11.5px]">{column.cards.length}</span>
      </div>
      <div className="flex flex-col gap-1 px-2 pb-2">
        {column.cards.slice(0, 3).map((c) => (
          <div key={c.path} className="bg-elev border-line truncate rounded-[10px] border px-3 py-2 text-[13px]">
            {c.title || c.label}
          </div>
        ))}
        {column.cards.length > 3 && (
          <div className="text-faint px-1 text-xs">+{column.cards.length - 3} more</div>
        )}
      </div>
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
  return sheetHref("/kanban", board, path);
}

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
