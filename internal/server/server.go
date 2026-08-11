// Package server exposes a bundle's index over HTTP as JSON.
//
// Only /api is reserved at the root; every other path belongs to the UI and is
// carried verbatim, bundle paths included.
package server

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"net/http"
	"path/filepath"

	"github.com/agentic-wiki/wikiview/internal/config"
	"github.com/agentic-wiki/wikiview/internal/store"
)

type Server struct {
	store  *store.Store
	events *broker
	ui     fs.FS
	mux    *http.ServeMux
	id     string
}

// New builds the server. ui is the built frontend, or nil to serve the API only
// (the development shape, where Vite serves the app and proxies /api here).
func New(s *store.Store, ui fs.FS) *Server {
	srv := &Server{
		store:  s,
		events: newBroker(),
		ui:     ui,
		mux:    http.NewServeMux(),
		id:     bundleID(s.View().Index.Bundle.Dir),
	}
	srv.mux.HandleFunc("GET /api/bundle", srv.handleBundle)
	srv.mux.HandleFunc("GET /api/entry/{path...}", srv.handleEntry)
	srv.mux.HandleFunc("GET /api/tree", srv.handleTree)
	srv.mux.HandleFunc("GET /api/events", srv.handleEvents)
	// The wildcard has to be the final segment, so the verb leads the path
	// rather than trailing it.
	srv.mux.HandleFunc("PUT /api/checkbox/{path...}", srv.handleCheckbox)
	// Files the bundle links to but does not index. Outside /api because it is
	// not JSON: an <img src> and a new tab both want the file itself.
	srv.mux.HandleFunc("GET /raw/{path...}", srv.handleRaw)
	// Everything not under /api belongs to the app.
	srv.mux.HandleFunc("GET /", srv.serveUI)
	return srv
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

// BundleInfo is what a client needs to know about the bundle itself, as opposed
// to any entry in it.
type BundleInfo struct {
	// ID scopes whatever the browser remembers about this bundle. One person
	// serving five knowledge bases from the same browser would otherwise carry a
	// view preference from one into another, where the folder it names may not
	// exist. Sent rather than derived so a bundle's identity has one definition
	// and the client never has to care how it is computed.
	ID string `json:"id"`
	// Label is the bundle's folder made readable, by the rule that names
	// everything else. Sent rather than sliced off Dir in the browser, so the
	// name at the top of the page agrees with the tree underneath it.
	Label   string   `json:"label"`
	Dir     string   `json:"dir"`
	Spec    string   `json:"spec"`
	Entries int      `json:"entries"`
	Tools   []string `json:"tools"`   // [tool.*] tables present in wiki.toml
	Version uint64   `json:"version"` // matches the SSE stream; compare to know you are stale
	// Boards are the boards declared in `[tool.wikiview]`, with their defaults
	// filled in. Declaring one decides what the UI surfaces, not what is
	// permitted: any folder is boardable by URL whether it is listed or not.
	Boards []config.Board `json:"boards,omitempty"`
}

// bundleID identifies a bundle by where it lives, which is the only thing
// distinguishing two of them on one machine: a bundle has no identity of its
// own, and inventing one would mean writing it into the folder.
//
// Moving a bundle therefore loses what the browser remembered about it. That is
// the right failure for a view preference. Anything worth keeping across a move
// belongs in wiki.toml, versioned with the files.
func bundleID(dir string) string {
	abs, err := filepath.Abs(dir)
	if err != nil {
		abs = dir // unresolvable only if the working directory is gone
	}
	sum := sha256.Sum256([]byte(abs))
	return hex.EncodeToString(sum[:6])
}

func (s *Server) handleBundle(w http.ResponseWriter, r *http.Request) {
	v := s.store.View()
	// Decoded per request rather than held, because it follows the same file the
	// index does: editing wiki.toml rebuilds, and the next request should see
	// the board you just declared. Problems are reported at startup rather than
	// on every fetch; a malformed board is not a reason to fail this response.
	boards, _ := config.Decode(v.Index.Bundle, v.Index)
	writeJSON(w, http.StatusOK, BundleInfo{
		ID:      s.id,
		Label:   dirLabel(v.Index.Bundle.Dir),
		Dir:     v.Index.Bundle.Dir,
		Spec:    v.Index.Bundle.Spec,
		Entries: len(v.Index.Entries),
		Tools:   v.Index.Bundle.Tools(),
		Version: v.Version,
		Boards:  boards.Board,
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
