// Package server exposes a bundle's index over HTTP as JSON.
//
// Only /api is reserved at the root; every other path belongs to the UI and is
// carried verbatim, bundle paths included.
package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/agentic-wiki/wiki/index"
	"github.com/agentic-wiki/wikiview/internal/store"
)

type Server struct {
	store *store.Store
	mux   *http.ServeMux
}

func New(s *store.Store) *Server {
	srv := &Server{store: s, mux: http.NewServeMux()}
	srv.mux.HandleFunc("GET /api/bundle", srv.handleBundle)
	srv.mux.HandleFunc("GET /api/entry/{path...}", srv.handleEntry)
	return srv
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

// BundleInfo is what a client needs to know about the bundle itself, as opposed
// to any entry in it.
type BundleInfo struct {
	Dir     string   `json:"dir"`
	Spec    string   `json:"spec"`
	Entries int      `json:"entries"`
	Tools   []string `json:"tools"` // [tool.*] tables present in wiki.toml
}

func (s *Server) handleBundle(w http.ResponseWriter, r *http.Request) {
	idx := s.store.Snapshot()
	writeJSON(w, http.StatusOK, BundleInfo{
		Dir:     idx.Bundle.Dir,
		Spec:    idx.Bundle.Spec,
		Entries: len(idx.Entries),
		Tools:   idx.Bundle.Tools(),
	})
}

// EntryView is one entry as a reader needs it: its frontmatter verbatim, its
// body unrendered, and the graph around it with every link already resolved to a
// bundle path.
//
// Links are resolved here rather than in the browser because turning a written
// link into a path is the engine's rule, and a client resolving them itself
// would be a second implementation of it.
type EntryView struct {
	Path        string         `json:"path"`
	Type        string         `json:"type"`
	Frontmatter map[string]any `json:"frontmatter"`
	Body        string         `json:"body"`
	Links       []LinkView     `json:"links"`
	Backlinks   []LinkView     `json:"backlinks"`
	Checkboxes  []CheckboxView `json:"checkboxes"`
}

type LinkView struct {
	From string `json:"from"`
	To   string `json:"to"`
	Text string `json:"text"`
	Line int    `json:"line"`
	// Exists is false for a link to an entry that is not in the bundle. Not an
	// error: per the format a broken link may be knowledge not yet written.
	Exists bool `json:"exists"`
}

type CheckboxView struct {
	Line int    `json:"line"`
	Done bool   `json:"done"`
	Text string `json:"text"`
}

func (s *Server) handleEntry(w http.ResponseWriter, r *http.Request) {
	idx := s.store.Snapshot()

	// The request path is only ever a map key, never a file operation. Rooting it
	// keeps Resolve on its lookup branch (a bare name would trigger a basename
	// scan), so `..` and absolute paths are meaningless here rather than
	// dangerous: they simply match no entry.
	path := "/" + strings.TrimPrefix(r.PathValue("path"), "/")
	e, err := idx.Resolve(path)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody{err.Error()})
		return
	}

	body, err := e.Body()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody{err.Error()})
		return
	}

	view := EntryView{
		Path:        e.Path,
		Type:        e.Type,
		Frontmatter: e.Frontmatter(),
		Body:        body,
		Links:       linkViews(idx, idx.Links(e.Path)),
		Backlinks:   linkViews(idx, idx.Backlinks(e.Path)),
		Checkboxes:  make([]CheckboxView, 0, len(e.Checkboxes)),
	}
	for _, c := range e.Checkboxes {
		view.Checkboxes = append(view.Checkboxes, CheckboxView{Line: c.Line, Done: c.Done, Text: c.Text})
	}
	writeJSON(w, http.StatusOK, view)
}

func linkViews(idx *index.Index, refs []index.LinkRef) []LinkView {
	out := make([]LinkView, 0, len(refs))
	for _, r := range refs {
		_, err := idx.Resolve(r.To)
		out = append(out, LinkView{From: r.From, To: r.To, Text: r.Text, Line: r.Line, Exists: err == nil})
	}
	return out
}

type errorBody struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	// The body is built from an index already in memory, so an encode failure
	// means a broken connection: the status line is already sent and there is
	// nothing useful left to say.
	_ = json.NewEncoder(w).Encode(v)
}
