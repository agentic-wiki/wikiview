// Package config reads wikiview's own section of the bundle's wiki.toml.
//
// Everything here is optional. A bundle with no `[tool.wikiview]` serves every
// view correctly: the reader needs no configuration, and a board infers its
// columns from the entries in the folder. Config exists for what inference gets
// wrong, not for what it gets right.
package config

import (
	"fmt"
	"sort"
	"strings"

	"github.com/agentic-wiki/wiki/bundle"
	"github.com/agentic-wiki/wiki/index"
)

// Board is one declared board.
//
// An array of tables rather than a flat list of paths, because every setting is
// per board: two backlogs in one bundle can legitimately use different status
// vocabularies, and `backlogs = [...]` cannot carry that.
//
//	[[tool.wikiview.board]]
//	path    = "/backlog"
//	where   = ["type=task"]                              # default
//	status  = "status"                                   # default
//	columns = ["backlog", "todo", "in-progress", "done"] # default: inferred
//	lane    = "priority"                                 # default: no lanes
type Board struct {
	// Path is the folder the board is over. The only required key.
	Path string `toml:"path" json:"path"`
	// ID identifies the board, which the path cannot once two boards are over one
	// folder — everything and just bugs, or the same tasks grouped two ways. It
	// is what the URL carries: `/kanban/<id>/<entry path>`.
	//
	// Required, and never derived here. A derived id would have to come from the
	// path, and then the first segment of a board URL is sometimes an id and
	// sometimes a folder name — which is the ambiguity the id exists to remove.
	// Suggesting one from the board's name belongs to whatever creates boards,
	// where a person can see it and change it.
	//
	// A word, never a path. A slash would put it back in competition with the
	// folder names it sits among.
	ID string `toml:"id" json:"id"`
	// Name is what to call this board on screen. Optional: a folder already has
	// a readable name, so this is for when that one is wrong rather than
	// something every board has to carry.
	//
	// Filled in by whoever displays it, not here — naming a path readably is a
	// presentation rule with one home, and it is not this package's.
	Name string `toml:"name" json:"name,omitempty"`
	// Where filters which entries are cards, in the `--where` spelling.
	Where []string `toml:"where" json:"where,omitempty"`
	// Status is the frontmatter field the columns come from.
	Status string `toml:"status" json:"status"`
	// Columns pins the order and declares columns that are still empty, which
	// inference alone can never do. Never a filter: a status present in the
	// entries but missing here gets a column appended rather than dropped.
	Columns []string `toml:"columns" json:"columns,omitempty"`
	// Lane groups rows within the board. Empty means no lanes.
	Lane string `toml:"lane" json:"lane,omitempty"`

	// Filters is Where, parsed. Built here so a consumer never re-implements the
	// query spelling: `index.ParseFilter` is the one that a CLI flag, a board
	// filter and a URL query all share.
	Filters []index.PropFilter `toml:"-" json:"-"`
}

type Config struct {
	Board []Board `toml:"board" json:"board,omitempty"`
}

// Defaults applied to a board that leaves a key out. A backlog is tasks with a
// `status`, which is what every starter workflow produces.
var (
	defaultWhere  = []string{"type=task"}
	defaultStatus = "status"
)

// RootID names the board every bundle has without configuring one.
const RootID = "root"

// Root is that board: the whole bundle, with every default.
//
// One built-in rather than "any folder boards by URL", so the first segment of
// a board address is always an id and never sometimes a folder name. A bundle
// with no config still has a kanban to open; a second one is something you
// declare, and declaring it is what gives it an id to be addressed by.
//
// A declared board may take this id, and then it is simply that board.
func Root() Board {
	return Defaults(Board{Path: "/", ID: RootID})
}

// Defaults fills in the keys a board may leave out.
//
// Exported because a caller sometimes needs to know what a board *would* hold
// before there is one to ask — declaring a board over a folder with no cards in
// it is a board that renders as an empty page, which is the hardest thing for
// whoever declared their first one to debug.
func Defaults(b Board) Board {
	if b.Status == "" {
		b.Status = defaultStatus
	}
	if b.Where == nil {
		b.Where = defaultWhere
	}
	b.Filters = nil
	for _, w := range b.Where {
		if f, err := index.ParseFilter(w); err == nil {
			b.Filters = append(b.Filters, f)
		}
	}
	return b
}

// Decode reads `[tool.wikiview]` and reports what is wrong with it.
//
// A problem is not an error. A board pointing at a folder somebody deleted, or
// a filter with a typo in it, must not stop the bundle being served — the
// reader does not need this config, and taking the server down over a view
// preference would be the wrong trade. The problems are reported and the rest
// of the config stands.
//
// Validation lives here rather than in `wiki check` because the whole point of
// `[tool.*]` is that the engine never parses inside it. The moment it validated
// one tool's keys it would hold an opinion about that tool.
func Decode(b *bundle.Bundle, idx *index.Index) (Config, []string) {
	var problems []string

	// Decoded twice: once loosely to see what keys are actually written, once
	// into the real shape. The loose pass is the only way to catch a misspelled
	// key, which otherwise decodes into nothing and is silently ignored — the
	// same footgun the engine surfaces for its own keys.
	var loose map[string]any
	if _, err := b.DecodeTool("wikiview", &loose); err != nil {
		return Config{}, []string{err.Error()}
	}
	problems = append(problems, unknownKeys(loose)...)

	var cfg Config
	if _, err := b.DecodeTool("wikiview", &cfg); err != nil {
		return Config{}, append(problems, err.Error())
	}

	// The id identifies a board, so two claiming one is a config that cannot
	// mean what it says: the second is unreachable, and silently taking the
	// first would hide a declaration somebody wrote on purpose. Two boards over
	// the same *path* are fine now — that is what ids are for.
	seen := map[string]int{}

	for i := range cfg.Board {
		board := &cfg.Board[i]
		if board.Path == "" {
			problems = append(problems, fmt.Sprintf("board %d: path is required", i+1))
			continue
		}
		if board.ID == "" {
			problems = append(problems, fmt.Sprintf("board %d (%s): id is required", i+1, board.Path))
			continue
		}
		if strings.Contains(board.ID, "/") {
			problems = append(problems, fmt.Sprintf(
				"board %d: id %q contains a slash, and an id is a word rather than a path", i+1, board.ID))
		}
		if first, ok := seen[board.ID]; ok {
			problems = append(problems, fmt.Sprintf(
				"board %d: id %q is already board %d, so give them different ids", i+1, board.ID, first))
		} else {
			seen[board.ID] = i + 1
		}
		if board.Status == "" {
			board.Status = defaultStatus
		}
		if board.Where == nil {
			board.Where = defaultWhere
		}
		for _, w := range board.Where {
			f, err := index.ParseFilter(w)
			if err != nil {
				problems = append(problems, fmt.Sprintf("board %s: %v", board.Path, err))
				continue
			}
			board.Filters = append(board.Filters, f)
		}
		if idx == nil {
			continue
		}
		if !hasEntries(idx, board.Path) {
			problems = append(problems, fmt.Sprintf("board %s: no entries there", board.Path))
		}
		// A grouping is by one value, and a list has many. Reported rather than
		// rendered, because what it renders is every card in one nameless group —
		// which looks like the board is broken and says nothing about why.
		scope := idx.Filter(strings.TrimSuffix(board.Path, "/"), nil)
		for key, field := range map[string]string{"status": board.Status, "lane": board.Lane} {
			if field != "" && IsList(scope, field) {
				problems = append(problems, fmt.Sprintf(
					"board %s: %s %q holds a list, which is not something to group by", board.Path, key, field))
			}
		}
	}
	return cfg, problems
}

// IsList reports whether a frontmatter key holds a list anywhere in scope.
//
// Anywhere rather than everywhere: one entry with `tags: [ui, api]` is enough to
// make grouping by `tags` undefined, whatever the others do.
func IsList(entries []*index.Entry, key string) bool {
	for _, e := range entries {
		if _, ok := e.Frontmatter()[key].([]string); ok {
			return true
		}
	}
	return false
}

// known keys, so a misspelling is reported rather than ignored.
var (
	topKeys   = map[string]bool{"board": true}
	boardKeys = map[string]bool{
		"path": true, "id": true, "name": true, "where": true, "status": true, "columns": true, "lane": true,
	}
)

func unknownKeys(loose map[string]any) []string {
	var out []string
	for key, value := range loose {
		if !topKeys[key] {
			out = append(out, fmt.Sprintf("unknown key [tool.wikiview] %s", key))
			continue
		}
		boards, _ := value.([]map[string]any)
		for i, board := range boards {
			for k := range board {
				if !boardKeys[k] {
					out = append(out, fmt.Sprintf("unknown key in board %d: %s", i+1, k))
				}
			}
		}
	}
	// Map iteration order is not something a startup message should vary by.
	sort.Strings(out)
	return out
}

// hasEntries reports whether anything in the index lives at or under path.
//
// A folder is not a thing the index holds — it holds entries — so "the folder
// exists" is really "something is in it", which is also the only version a
// board cares about.
func hasEntries(idx *index.Index, path string) bool {
	if path == "/" {
		return len(idx.Entries) > 0
	}
	prefix := strings.TrimSuffix(path, "/") + "/"
	for _, e := range idx.Entries {
		if e.Path == path || strings.HasPrefix(e.Path, prefix) {
			return true
		}
	}
	return false
}
