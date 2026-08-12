import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Board, type Card, type Column } from "@/api";
import { EntryView } from "@/views/EntryView";
import { Loading } from "@/views/Loading";
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
  version,
  refresh,
}: {
  /** The board's id, which is the first segment of the address. */
  id: string;
  /** The entry open over it, or "" for none. Everything after the id. */
  card: string;
  version: number;
  refresh: number;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  if (error) return <NotFound path={"/kanban/" + id} hint="There is no board with that id" />;
  if (!board) return <Loading />;

  const cards = board.columns.reduce((n, c) => n + c.cards.length, 0);
  if (cards === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="text-fg font-medium">Nothing to board here</p>
          <p className="text-muted mt-1 text-sm">
            No entry under {board.path} matches this board.
          </p>
        </div>
      </div>
    );
  }

  // Every path this board holds, which is what decides whether a link inside a
  // card stays here or leaves for the reader.
  const onBoard = new Set(board.columns.flatMap((c) => c.cards.map((c) => c.path)));

  return (
    <div className="flex h-full min-h-0">
      {/* Columns scroll sideways as a set while each scrolls its own cards, so a
          long column does not push the board's own height around. */}
      <div className="flex min-w-0 grow gap-3 overflow-x-auto p-4">
        {board.columns.map((column) => (
          <BoardColumn
            key={column.value || " unset"}
            board={board.id}
            column={column}
            field={board.field}
            lane={board.lane}
          />
        ))}
      </div>

      {card && (
        <CardSheet
          board={board.id}
          path={card}
          version={version}
          refresh={refresh}
          onBoard={onBoard}
          // Replaced rather than pushed: closing a card should not leave a
          // history entry you have to press back through twice.
          onClose={() => navigate("/kanban/" + board.id, { replace: true })}
        />
      )}
    </div>
  );
}

function BoardColumn({
  board,
  column,
  field,
  lane,
}: {
  /** The board id, which every card address starts with. */
  board: string;
  column: Column;
  field: string;
  lane?: string;
}) {
  // Grouped here rather than by the server, because a lane is a way of reading
  // one column rather than a property of the board's contents: the cards and
  // their lane values are the data, and this is an arrangement of them.
  const lanes = useMemo(() => groupByLane(column.cards, lane), [column.cards, lane]);

  return (
    <section
      aria-label={column.value || `no ${field}`}
      className="bg-surface/40 border-border flex w-72 shrink-0 flex-col rounded-lg border"
    >
      <header className="border-border flex items-baseline gap-2 border-b px-3 py-2">
        {/* An unnamed column is the one holding cards with no such field, which
            is a fact about them rather than a status anybody wrote. */}
        <h2 className="text-fg truncate text-sm font-medium">
          {column.value || <span className="text-muted italic">no {field}</span>}
        </h2>
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
              <BoardCard key={card.path} board={board} card={card} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function BoardCard({ board, card }: { board: string; card: Card }) {
  return (
    // Opens beside the board rather than navigating away from it. A card is
    // something you look at while keeping the columns in view.
    <Link
      to={cardHref(board, card.path)}
      className="border-border/70 bg-bg hover:border-muted/60 block rounded-md border p-2 transition-colors"
    >
      <span className="text-fg block truncate text-sm">{card.label}</span>
      {/* What the entry calls itself, under the filename, when it says something
          the filename does not. */}
      {card.title && card.title !== card.label && (
        <span className="text-muted mt-0.5 block truncate text-xs">{card.title}</span>
      )}
    </Link>
  );
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
  onBoard,
  onClose,
}: {
  board: string;
  path: string;
  version: number;
  refresh: number;
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
