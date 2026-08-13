package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/agentic-wiki/wikiview/internal/git"
)

// gitResult is what every git endpoint answers with.
//
// The status travels with the outcome, success or failure, because a client that
// has just been told an action failed needs to know what the repository looks
// like *now* — and asking again would be asking about a different moment.
type gitResult struct {
	Status git.Status `json:"status"`
	// Error is git's own words, empty on success. Carried in the body rather than
	// only in the HTTP status so the two arrive together.
	Error string `json:"error,omitempty"`
	// Proposed is the branch name offered when a pull had to be abandoned, so
	// the way out is in the same answer as the problem.
	Proposed string `json:"proposed,omitempty"`
}

func (s *Server) handleGitStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, gitResult{Status: s.gitStatus()})
}

// handleGitFetch asks the remote what it has.
//
// The one read that reaches the network, and it happens only when somebody opens
// a preview. Nothing here fetches on load or on a timer: the bundle belongs to
// the user and to whatever agent is editing it, and surprising either with a
// network operation is worse than making somebody click.
func (s *Server) handleGitFetch(w http.ResponseWriter, r *http.Request) {
	s.acting.Lock()
	defer s.acting.Unlock()

	status, err := git.Fetch(r.Context(), s.store.Dir)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, gitResult{Status: s.gitStatus(), Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, gitResult{Status: status})
}

func (s *Server) handleGitPull(w http.ResponseWriter, r *http.Request) {
	s.acting.Lock()
	defer s.acting.Unlock()

	status, err := git.Pull(r.Context(), s.store.Dir)
	// The files moved under the index either way: a pull that succeeded changed
	// them, and one that was undone changed them and changed them back. Rebuilt
	// deliberately rather than left to the watcher, so the answer to this request
	// already describes what is on disk.
	_ = s.RebuildAndNotify()
	if err != nil {
		// The way out travels with the failure. The local work is intact and
		// still local; this is the name it would go to.
		writeJSON(w, http.StatusConflict, gitResult{
			Status:   status,
			Error:    err.Error(),
			Proposed: git.ProposedBranch(time.Now()),
		})
		return
	}
	writeJSON(w, http.StatusOK, gitResult{Status: status})
}

func (s *Server) handleGitSync(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{"malformed request: " + err.Error()})
		return
	}

	s.acting.Lock()
	defer s.acting.Unlock()

	status, err := git.Sync(r.Context(), s.store.Dir, req.Message)
	if err != nil {
		writeJSON(w, http.StatusConflict, gitResult{Status: status, Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, gitResult{Status: status})
}

func (s *Server) handleGitBranch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{"malformed request: " + err.Error()})
		return
	}

	s.acting.Lock()
	defer s.acting.Unlock()

	status, err := git.Branch(r.Context(), s.store.Dir, req.Name)
	if err != nil {
		writeJSON(w, http.StatusConflict, gitResult{Status: status, Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, gitResult{Status: status})
}

// handleRefresh rebuilds the index from disk.
//
// The one action that reaches nothing and undoes nothing, so it acts on the
// click rather than previewing first. A preview of "I will re-read the files"
// would be ceremony, and the rule it would be obeying exists for the two actions
// that are hard to take back.
func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	if err := s.RebuildAndNotify(); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody{err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]uint64{"version": s.store.View().Version})
}

// gitStatus reads the repository the bundle sits in.
//
// The bundle's own directory rather than the repository root, because a bundle
// can be a subdirectory of a larger repo and every one of these actions is
// scoped to the notes rather than to the whole worktree.
func (s *Server) gitStatus() git.Status {
	return git.Repo(s.store.Dir)
}
