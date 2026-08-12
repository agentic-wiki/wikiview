package server

import (
	"encoding/json"
	"net/http"
	"path"
	"slices"
	"strings"

	"github.com/agentic-wiki/wiki/index"
	"github.com/agentic-wiki/wikiview/internal/config"
	"github.com/agentic-wiki/wikiview/internal/store"
)

// checkboxRequest toggles one checkbox.
//
// Version is the bundle version the client was looking at. It is not optimistic
// locking for its own sake: the write is addressed by *line*, and a line number
// only means something against the content it was read from. If the entry
// changed underneath — an agent edited it, `tidy` moved things, someone saved in
// an editor — line 12 may now be a different checkbox, or not a checkbox at all.
// Refusing is the only safe answer, and the client refetches.
type checkboxRequest struct {
	Line    int    `json:"line"`
	Done    bool   `json:"done"`
	Version uint64 `json:"version"`
}

func (s *Server) handleCheckbox(w http.ResponseWriter, r *http.Request) {
	var req checkboxRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{"malformed request: " + err.Error()})
		return
	}

	// One read, so the version checked and the index written against are the
	// same rebuild. Taken separately, a rebuild landing between them would let
	// the guard pass on one version and the write land on another — which is
	// exactly the staleness the guard exists to catch.
	v := s.store.View()
	if req.Version != v.Version {
		writeJSON(w, http.StatusConflict, conflictBody{
			Error:   "the entry changed since you read it",
			Version: v.Version,
		})
		return
	}

	idx := v.Index
	entryPath := "/" + strings.TrimPrefix(r.PathValue("path"), "/")
	e, err := idx.Resolve(entryPath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody{err.Error()})
		return
	}

	// The engine owns the edit: exactly one character changes, the write is
	// atomic, and the entry re-parses itself afterwards. Nothing here knows what
	// a checkbox looks like on disk.
	if err := e.SetCheckbox(req.Line, req.Done); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{err.Error()})
		return
	}
	s.committed(w)
}

// cardRequest moves one card to another column.
//
// Value rather than a field name: which frontmatter key a column stands for is
// the board's `status`, which is decoded here already. A client naming the key
// would be a second copy of that rule, and an API that writes any key on any
// entry — a general frontmatter editor, which this reader is deliberately not.
type cardRequest struct {
	Value   string `json:"value"`
	Version uint64 `json:"version"`
}

func (s *Server) handleCard(w http.ResponseWriter, r *http.Request) {
	var req cardRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{"malformed request: " + err.Error()})
		return
	}

	// One read, for the same reason as a checkbox: the version checked and the
	// index written against have to be the same rebuild.
	v := s.store.View()
	if req.Version != v.Version {
		writeJSON(w, http.StatusConflict, conflictBody{
			Error:   "the board changed since you read it",
			Version: v.Version,
		})
		return
	}

	cfg, _ := config.Decode(v.Index.Bundle, v.Index)
	board, _ := boardFor(cfg, r.PathValue("id"))
	if board.ID == "" {
		writeJSON(w, http.StatusNotFound, errorBody{"no board with that id"})
		return
	}

	// Dropping onto the column of entries with no status would mean *removing*
	// the field, which is a different operation wearing the same gesture. So that
	// column takes no drops, and this says so rather than unsetting quietly.
	if req.Value == "" {
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{"a card cannot be moved to no status"})
		return
	}

	entryPath := "/" + strings.TrimPrefix(r.PathValue("path"), "/")
	e, err := v.Index.Resolve(entryPath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody{err.Error()})
		return
	}
	// On this board, not merely in the bundle. The board is what says which field
	// to write, so an entry outside its slice would be written with a rule that
	// was never meant for it.
	if !onBoard(v, board, e.Path) {
		writeJSON(w, http.StatusNotFound, errorBody{"no card at that path on this board"})
		return
	}

	if err := e.SetField(board.Status, req.Value); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{err.Error()})
		return
	}
	s.committed(w)
}

// declareRequest is a new board: which folder, called what, addressed how.
//
// No version guard, unlike the writes above. Those are addressed by something
// only meaningful against the content they were read from — a line, a column —
// and this is not: it appends a board that did not exist, and the answer is the
// same whatever else changed meanwhile.
type declareRequest struct {
	ID   string `json:"id"`
	Path string `json:"path"`
	Name string `json:"name"`
}

// handleDeclareBoard adds a board to the bundle's wiki.toml.
//
// A config write, and deliberately an explicit one. This edits a file the user
// owns and `wiki` also reads, so it is something asked for rather than something
// implied by having visited a folder.
func (s *Server) handleDeclareBoard(w http.ResponseWriter, r *http.Request) {
	var req declareRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{"malformed request: " + err.Error()})
		return
	}

	v := s.store.View()
	cfg, _ := config.Decode(v.Index.Bundle, v.Index)

	board := config.Defaults(config.Board{
		ID:   req.ID,
		Path: path.Clean("/" + strings.Trim(req.Path, "/")),
		Name: req.Name,
	})
	// A board with no cards renders as an empty page, and an empty page is the
	// hardest thing for whoever declared their first board to debug. Asked with
	// the board's own defaults, so the answer is the one the board would give.
	if len(v.Index.Filter(strings.TrimSuffix(board.Path, "/"), board.Filters)) == 0 {
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{
			"nothing under " + board.Path + " would be a card: a board holds entries with `type: task`",
		})
		return
	}
	if err := config.Declare(v.Index.Bundle.Dir, cfg, board); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{err.Error()})
		return
	}
	s.committed(w)
}

// handleBoardSettings changes what a board is, rather than what is on it.
//
// A PUT of the whole settings object rather than a patch of one key: the form
// that sends this shows all of them at once, so a partial update would mean
// deciding whether an absent key is "unchanged" or "cleared" — and clearing is
// exactly how you say a board has no lanes.
func (s *Server) handleBoardSettings(w http.ResponseWriter, r *http.Request) {
	var req config.Settings
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{"malformed request: " + err.Error()})
		return
	}

	v := s.store.View()
	cfg, _ := config.Decode(v.Index.Bundle, v.Index)
	id := strings.Trim(r.PathValue("id"), "/")
	if _, declared := boardFor(cfg, id); !declared && id != config.RootID {
		writeJSON(w, http.StatusNotFound, errorBody{"no board with that id"})
		return
	}

	// The query spelling has one implementation, and it is the engine's. A filter
	// that does not parse is reported here rather than written and reported on
	// every startup afterwards.
	for _, expr := range req.Where {
		if _, err := index.ParseFilter(expr); err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, errorBody{err.Error()})
			return
		}
	}

	// A column or a lane is one value, and a list has many. Written anyway, it
	// renders as every card in one nameless group, which reads as a broken board
	// rather than a setting that cannot mean anything.
	board, _ := boardFor(cfg, id)
	scope := v.Index.Filter(strings.TrimSuffix(board.Path, "/"), nil)
	for name, field := range map[string]string{"status": req.Status, "lane": req.Lane} {
		if field != "" && config.IsList(scope, field) {
			writeJSON(w, http.StatusUnprocessableEntity, errorBody{
				name + " " + field + " holds a list, which is not something to group by",
			})
			return
		}
	}

	if err := config.Update(v.Index.Bundle.Dir, id, req); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{err.Error()})
		return
	}
	s.committed(w)
}

// onBoard reports whether an entry is one of the board's cards.
func onBoard(v store.View, board config.Board, entryPath string) bool {
	prefix := board.Path
	if prefix == "/" {
		prefix = ""
	}
	return slices.ContainsFunc(v.Index.Filter(prefix, board.Filters), func(e *index.Entry) bool {
		return e.Path == entryPath
	})
}

// committed rebuilds after a write and answers with the version the write
// produced.
//
// Rebuilt here rather than waiting for the watcher, so the response already
// reflects the write and the client is never briefly told a stale version.
func (s *Server) committed(w http.ResponseWriter) {
	if err := s.RebuildAndNotify(); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody{err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]uint64{"version": s.store.View().Version})
}

// conflictBody carries the current version so a client can resync in one step
// rather than having to ask what it missed.
type conflictBody struct {
	Error   string `json:"error"`
	Version uint64 `json:"version"`
}
