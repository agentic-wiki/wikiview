package server

import (
	"encoding/json"
	"net/http"
	"strings"
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

	// Checked before resolving, so the guard covers the whole operation rather
	// than a window inside it.
	if current := s.store.Version(); req.Version != current {
		writeJSON(w, http.StatusConflict, conflictBody{
			Error:   "the entry changed since you read it",
			Version: current,
		})
		return
	}

	idx := s.store.Snapshot()
	path := "/" + strings.TrimPrefix(r.PathValue("path"), "/")
	e, err := idx.Resolve(path)
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

	// Rebuilt here rather than waiting for the watcher, so the response already
	// reflects the write and the client is never briefly told a stale version.
	if _, err := s.store.Rebuild(); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody{err.Error()})
		return
	}
	version := s.store.Version()
	s.Notify(version)

	writeJSON(w, http.StatusOK, map[string]uint64{"version": version})
}

// conflictBody carries the current version so a client can resync in one step
// rather than having to ask what it missed.
type conflictBody struct {
	Error   string `json:"error"`
	Version uint64 `json:"version"`
}
