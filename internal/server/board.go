package server

import (
	"maps"
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
	Lane string `json:"lane,omitempty"`
	// Where is the filter deciding which entries are cards, in the `--where`
	// spelling. Reported so an editor can show what a board is currently doing
	// rather than making somebody read wiki.toml to find out.
	Where []string `json:"where"`
	// Blockers is the field naming what an entry waits on, so an editor can show
	// which one this board reads.
	Blockers string   `json:"blockers"`
	Columns  []Column `json:"columns"`
	// Fields are the frontmatter keys the board's folder uses, with their values.
	//
	// So choosing a status field, a lane or a filter is picking from what is
	// there rather than recalling how this bundle spells things. Assembled here
	// because the client has cards, not frontmatter, and asking for every entry
	// to find out would be a request per card.
	Fields []Field `json:"fields"`
	// Declared is false for the built-in root board, which no config mentions.
	Declared bool `json:"declared"`
}

// Field is one frontmatter key in use, and what it holds.
type Field struct {
	Key string `json:"key"`
	// Values are the distinct values, when there are few enough to be a choice.
	//
	// Absent for a key that is free text: a title has as many values as there
	// are entries, and a list of them is not something to pick from. A key with
	// no values offered is still a key you can filter on by typing one.
	Values []string `json:"values,omitempty"`
	// List is true for a key holding a list anywhere in scope.
	//
	// It filters perfectly well — `tags=bug` matches on membership — and groups
	// not at all, since a column or a lane is one value and a list has many. So
	// the two are told apart here rather than each caller guessing.
	List bool `json:"list,omitempty"`
}

// enough is where a key stops being a set of choices and starts being prose.
const enough = 24

type Column struct {
	// Value is the status this column holds, empty for the column of entries
	// that carry no status at all.
	Value string `json:"value"`
	// Pinned is true for a column the config declares.
	//
	// A board is inference plus config, and which is which changes what happens
	// next: renaming a status in the entries makes an inferred column vanish and
	// leaves a pinned one empty. Showing them identically is what makes config
	// feel haunted.
	Pinned bool   `json:"pinned"`
	Cards  []Card `json:"cards"`
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
	// BlockedBy is how many entries this one is waiting on, and Blocks how many
	// are waiting on it.
	//
	// Two opposite facts, so two numbers. Being blocked is a reason not to start
	// and blocking others is a reason to, and one figure could say neither.
	// Counts rather than verdicts: nothing here knows which of a bundle's status
	// values mean finished, so it reports the edges and leaves the judgement.
	BlockedBy int `json:"blockedBy,omitempty"`
	Blocks    int `json:"blocks,omitempty"`
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
		Path: board.Path,
		ID:   board.ID,
		Name: board.Name,
		// A board over nothing still has columns, they are just none of them. A
		// nil slice marshals as `null`, and a client reading a list it was
		// promised has no reason to check.
		Columns:  []Column{},
		Field:    board.Status,
		Lane:     board.Lane,
		Where:    board.Where,
		Blockers: board.Blockers,
		Declared: declared,
	}

	prefix := board.Path
	if prefix == "/" {
		prefix = "" // the whole bundle, which is what Filter reads an empty prefix as
	}
	entries := v.Index.Filter(prefix, board.Filters)

	// The inventory is taken before the board's own filter, not after: you use it
	// to choose that filter, and a list narrowed by the filter you are replacing
	// can only ever offer what you already have.
	out.Fields = fieldsIn(v.Index.Filter(prefix, nil))

	// Grouped first, then ordered, because the two rules are different: which
	// columns exist comes from the entries, and what order they sit in comes
	// from the config.
	waiting, blocking := blockerEdges(v.Index, board.Blockers)

	cards := map[string][]Card{}
	for _, e := range entries {
		value := e.Field(board.Status)
		cards[value] = append(cards[value], Card{
			Path:      e.Path,
			Label:     titleFromFilename(e.Path),
			Title:     e.Field("title"),
			Type:      e.Type,
			Lane:      laneOf(e, board.Lane),
			BlockedBy: waiting[e.Path],
			Blocks:    blocking[e.Path],
		})
	}

	// Declared columns first, in the order they were written, including the ones
	// with nothing in them: declaring "in-progress" before anything is in it is
	// the thing inference can never do.
	seen := map[string]bool{}
	for _, value := range board.Columns {
		out.Columns = append(out.Columns, Column{Value: value, Pinned: true, Cards: sorted(cards[value])})
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

// fieldsIn collects the frontmatter keys a set of entries uses.
//
// A list-valued key contributes its items rather than itself, because that is
// what `tags=bug` matches — the inventory has to describe the same thing the
// filter does or it offers values nothing can be filtered by.
func fieldsIn(entries []*index.Entry) []Field {
	values := map[string]map[string]bool{}
	for _, e := range entries {
		for key := range e.Frontmatter() {
			if values[key] == nil {
				values[key] = map[string]bool{}
			}
			for _, v := range e.FieldList(key) {
				values[key][v] = true
			}
		}
	}

	out := make([]Field, 0, len(values))
	for key, set := range values {
		field := Field{Key: key, List: config.IsList(entries, key)}
		if len(set) <= enough {
			field.Values = slices.Sorted(maps.Keys(set))
		}
		out = append(out, field)
	}
	slices.SortFunc(out, func(a, b Field) int { return strings.Compare(a.Key, b.Key) })
	return out
}

// blockerEdges counts, per entry path, what it is waiting on and what waits on
// it.
//
// Over the whole bundle rather than the board's own cards: "this is holding up
// three things" is true whether or not those three are on the board you happen
// to be looking at, and counting only the board's would make the same task read
// differently from two places.
//
// A blocker resolves the way any frontmatter reference does — a `.md` value,
// resolved relative to the entry, inside the bundle — so what counts as one has
// a single rule. It is counted whether or not the file exists yet: a task
// waiting on something nobody has written is waiting all the same, and this
// format expects the link before the file.
func blockerEdges(idx *index.Index, field string) (waiting, blocking map[string]int) {
	waiting, blocking = map[string]int{}, map[string]int{}
	if field == "" {
		return waiting, blocking
	}
	for _, e := range idx.Entries {
		for _, value := range e.FieldList(field) {
			if !strings.HasSuffix(value, ".md") {
				continue
			}
			target, outside := idx.ResolveLink(e.Path, value)
			if outside {
				continue
			}
			waiting[e.Path]++
			blocking[target]++
		}
	}
	return waiting, blocking
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
