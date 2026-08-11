package server

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// serveUI serves the built app, falling back to index.html for anything that is
// not a file.
//
// The fallback is what makes a real route survive a cold load. `/wiki/notes/a.md`
// is a client route, not a file, so a refresh or a pasted link arrives here with
// nothing to serve; returning index.html lets the app boot and route itself.
// That is the price of using the History API instead of hash routes, and hash
// routes are not available — the fragment carries heading anchors.
//
// Only /api is reserved, so everything else is handed to the app verbatim,
// bundle paths and all.
func (s *Server) serveUI(w http.ResponseWriter, r *http.Request) {
	if s.ui == nil {
		// The likeliest way to arrive here is `go install`, which compiles
		// against an empty ui/dist because the frontend is built and never
		// committed. Saying so beats leaving someone to wonder why the API
		// answers and the page does not.
		http.Error(w, "no UI was built into this binary: build it with `just build`, or run `just ui-dev` and use the Vite server", http.StatusNotFound)
		return
	}

	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name == "" || name == "." {
		name = "index.html"
	}

	if f, err := s.ui.Open(name); err == nil {
		if st, err := f.Stat(); err == nil && !st.IsDir() {
			f.Close()
			// Hashed asset filenames change whenever their content does, so they
			// are safe to cache hard; index.html must not be, or the app never
			// picks up a new build.
			if strings.HasPrefix(name, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			http.FileServerFS(s.ui).ServeHTTP(w, r)
			return
		}
		f.Close()
	}

	// Not a file: a client route. Serve the app and let it decide.
	index, err := fs.ReadFile(s.ui, "index.html")
	if err != nil {
		http.Error(w, "no index.html in the built UI", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(index)
}
