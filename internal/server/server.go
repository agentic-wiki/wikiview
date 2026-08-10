// Package server exposes a bundle's index over HTTP as JSON.
//
// Only /api is reserved at the root; every other path belongs to the UI and is
// carried verbatim, bundle paths included.
package server

import (
	"encoding/json"
	"io/fs"
	"net/http"

	"github.com/agentic-wiki/wikiview/internal/store"
)

type Server struct {
	store  *store.Store
	events *broker
	ui     fs.FS
	mux    *http.ServeMux
}

// New builds the server. ui is the built frontend, or nil to serve the API only
// (the development shape, where Vite serves the app and proxies /api here).
func New(s *store.Store, ui fs.FS) *Server {
	srv := &Server{store: s, events: newBroker(), ui: ui, mux: http.NewServeMux()}
	srv.mux.HandleFunc("GET /api/bundle", srv.handleBundle)
	srv.mux.HandleFunc("GET /api/entry/{path...}", srv.handleEntry)
	srv.mux.HandleFunc("GET /api/tree", srv.handleTree)
	srv.mux.HandleFunc("GET /api/events", srv.handleEvents)
	// Everything not under /api belongs to the app.
	srv.mux.HandleFunc("GET /", srv.serveUI)
	return srv
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

// BundleInfo is what a client needs to know about the bundle itself, as opposed
// to any entry in it.
type BundleInfo struct {
	Dir     string   `json:"dir"`
	Spec    string   `json:"spec"`
	Entries int      `json:"entries"`
	Tools   []string `json:"tools"`   // [tool.*] tables present in wiki.toml
	Version uint64   `json:"version"` // matches the SSE stream; compare to know you are stale
}

func (s *Server) handleBundle(w http.ResponseWriter, r *http.Request) {
	idx := s.store.Snapshot()
	writeJSON(w, http.StatusOK, BundleInfo{
		Dir:     idx.Bundle.Dir,
		Spec:    idx.Bundle.Spec,
		Entries: len(idx.Entries),
		Tools:   idx.Bundle.Tools(),
		Version: s.store.Version(),
	})
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
