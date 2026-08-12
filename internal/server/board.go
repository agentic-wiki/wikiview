package server

import (
	"net/http"
	"slices"
	"strings"

	"github.com/agentic-wiki/wiki/index"
	"github.com/agentic-wiki/wikiview/internal/config"
	"github.com/agentic-wiki/wikiview/internal/store"
)

// BoardView is one folder stacked into columns.
//
// Assembled here rather than in the browser because everything it needs is
// already here: the config is decoded, `where` is parsed into filters, and the
// status field is whatever the board names. A client rebuilding that from the
// tree would need every entry's frontmatter, which is a request per card, and
// would be re-implementing rules that have one home.
type BoardView struct {
	Path string `json:"path"`
	// ID is what the URL carries, so a client can link to this board without
	// deciding for itself whether to use an id or a path.
	ID string `json:"id"`
	// Name is what to call this board, from the config or from the folder.
	Name string `json:"name"`
	// Field is the frontmatter key the columns are made of, so a client can say
	// what it is showing without inferring it.
	Field string `json:"field"`
	// Lane is the field rows are grouped by, empty when the board has no lanes.
	// One lane is no lanes: a board is columns of cards until asked otherwise.
	Lane    string   `json:"lane,omitempty"`
	Columns []Column `json:"columns"`
	// Declared is false for a folder boarded by URL without config. Boarding is
	// discovery, not permission, and this only says which of the two happened.
	Declared bool `json:"declared"`
}

type Column struct {
	// Value is the status this column holds, empty for the column of entries
	// that carry no status at all.
	Value string `json:"value"`
	Cards []Card `json:"cards"`
}

type Card struct {
	Path  string `json:"path"`
	Label string `json:"label"`
	Title string `json:"title,omitempty"`
	Type  string `json:"type,omitempty"`
	// Lane is this card's value for the board's lane field, empty when it has
	// none. A card missing the field gets its own lane rather than joining the
	// first one.
	Lane string `json:"lane,omitempty"`
}

func (s *Server) handleBoard(w http.ResponseWriter, r *http.Request) {
	v := s.store.View()
	id := strings.Trim(r.PathValue("id"), "/")

	cfg, _ := config.Decode(v.Index.Bundle, v.Index)
	board, declared := boardFor(cfg, id)
	if board.ID == "" {
		// An id nothing declares is a wrong address, not a folder to go and
		// board: boards are declared, and the reader is where you browse.
		writeJSON(w, http.StatusNotFound, errorBody{"no board with that id"})
		return
	}
	writeJSON(w, http.StatusOK, buildBoard(v, named(board, v.Index.Bundle.Dir), declared))
}

// named fills in a board's display name when the config does not give one.
//
// A board is a folder, and a folder already has a readable name, so no bundle
// should have to write `name = "Backlog"` to avoid a rail listing `/backlog`.
// The root is the exception: "/" reads as nothing, so it borrows the bundle's
// own name, which is what a board over everything is.
func named(b config.Board, dir string) config.Board {
	if b.Name != "" {
		return b
	}
	if strings.TrimSuffix(b.Path, "/") == "" {
		b.Name = dirLabel(dir)
	} else {
		b.Name = titleFromFilename(b.Path)
	}
	return b
}

// boardFor resolves an id to a board. Reports whether there is one.
//
// Only ids, never paths. That is what lets an address put a card after the
// board — `/kanban/<id>/<entry path>` splits at the first segment, and there is
// no second reading of it. A folder name in that position would make
// `/kanban/a/b` mean either the board `a` showing `/b` or the folder `/a/b`.
func boardFor(cfg config.Config, id string) (config.Board, bool) {
	id = strings.Trim(id, "/")
	for _, b := range cfg.Board {
		if b.ID == id {
			return b, true
		}
	}
	// The one board nothing has to declare, so an unconfigured bundle still has
	// a kanban to open.
	if id == "" || id == config.RootID {
		return config.Root(), false
	}
	return config.Board{}, false
}

func buildBoard(v store.View, board config.Board, declared bool) BoardView {
	out := BoardView{
		Path:     board.Path,
		ID:       board.ID,
		Name:     board.Name,
		Field:    board.Status,
		Lane:     board.Lane,
		Declared: declared,
	}

	prefix := board.Path
	if prefix == "/" {
		prefix = "" // the whole bundle, which is what Filter reads an empty prefix as
	}
	entries := v.Index.Filter(prefix, board.Filters)

	// Grouped first, then ordered, because the two rules are different: which
	// columns exist comes from the entries, and what order they sit in comes
	// from the config.
	cards := map[string][]Card{}
	for _, e := range entries {
		value := e.Field(board.Status)
		cards[value] = append(cards[value], Card{
			Path:  e.Path,
			Label: titleFromFilename(e.Path),
			Title: e.Field("title"),
			Type:  e.Type,
			Lane:  laneOf(e, board.Lane),
		})
	}

	// Declared columns first, in the order they were written, including the ones
	// with nothing in them: declaring "in-progress" before anything is in it is
	// the thing inference can never do.
	seen := map[string]bool{}
	for _, value := range board.Columns {
		out.Columns = append(out.Columns, Column{Value: value, Cards: sorted(cards[value])})
		seen[value] = true
	}

	// Then everything the entries turned out to have. No card may be invisible:
	// a status nobody declared still gets a column rather than vanishing from a
	// board while sitting in the folder.
	var rest []string
	for value := range cards {
		if !seen[value] && value != "" {
			rest = append(rest, value)
		}
	}
	slices.Sort(rest)
	for _, value := range rest {
		out.Columns = append(out.Columns, Column{Value: value, Cards: sorted(cards[value])})
	}

	// Entries with no status at all, last, and only when there are some. An
	// always-present empty column would be a column about nothing.
	if unset := cards[""]; len(unset) > 0 && !seen[""] {
		out.Columns = append(out.Columns, Column{Value: "", Cards: sorted(unset)})
	}
	return out
}

// laneOf reads a card's lane, or "" when the board has no lanes or the entry
// lacks the field.
func laneOf(e *index.Entry, field string) string {
	if field == "" {
		return ""
	}
	return e.Field(field)
}

// sorted puts cards in path order, which is the order the filenames encode and
// the same order the tree shows. Nothing here invents a ranking.
func sorted(cards []Card) []Card {
	slices.SortFunc(cards, func(a, b Card) int { return strings.Compare(a.Path, b.Path) })
	if cards == nil {
		return []Card{}
	}
	return cards
}
