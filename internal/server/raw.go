package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// inlineTypes are the content types served for display. Everything else is
// downloaded instead.
//
// The list is short on purpose. This server has one origin, and an entry's HTML
// is deliberately not rendered so that writing a file in the bundle does not
// make you an author of the UI. Serving `.html` as text/html would hand that
// straight back, so it leaves as a download.
//
// `.svg` displays, under the policy below. It is an image type that can carry
// script, but only when navigated to — a browser will not run script in one
// loaded through an <img>, which is how an entry shows a diagram.
var inlineTypes = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".ico":  "image/x-icon",
	".svg":  "image/svg+xml",
	".pdf":  "application/pdf",
	".txt":  "text/plain; charset=utf-8",
	".csv":  "text/plain; charset=utf-8",
	".log":  "text/plain; charset=utf-8",
	".md":   "text/markdown; charset=utf-8",
}

// svgPolicy lets an SVG draw and nothing else.
//
// `sandbox` puts the document in an opaque origin, so even a script that ran
// could not reach this server's API or storage; `default-src 'none'` means none
// runs in the first place. Inline styles stay allowed because SVGs written by
// real tools use them constantly.
//
// Applied only to SVG. A blanket sandbox would also cover PDFs, where it
// interferes with the browser's built-in viewer.
const svgPolicy = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

// handleRaw serves a file of the bundle as it is on disk: an entry with its
// frontmatter still attached, or something an entry links to that the index
// does not hold — an image, a contract, a spreadsheet.
//
// **It serves what the index refers to, not what the directory contains**, and
// the difference is the whole security model. The path is a key before it is
// ever a path, so `/raw/.env` and a percent-encoded climb out of the bundle
// both miss for the same reason a mistyped entry does: there is no such key.
// Nothing here walks a directory or tests a path for safety, which is why this
// cannot become a file server pointed at somebody's home directory.
//
// A file becomes reachable by being an entry, or by an entry linking to it.
// Dropping the last link to an image makes it unreachable again, which is the
// intended behaviour rather than an oversight: reachability follows the
// bundle's own references.
func (s *Server) handleRaw(w http.ResponseWriter, r *http.Request) {
	v := s.store.View()
	path := "/" + strings.TrimPrefix(r.PathValue("path"), "/")
	if _, ok := v.Files[path]; !ok {
		writeJSON(w, http.StatusNotFound, errorBody{"nothing linked at that path"})
		return
	}

	// Resolved before opening. The key is in the bundle by construction, but a
	// symlink sitting at that path is not bound by that, and following one would
	// serve a file the bundle only points at.
	full, err := filepath.EvalSymlinks(filepath.Join(v.Index.Bundle.Dir, filepath.FromSlash(path)))
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody{"not found"})
		return
	}
	root, err := filepath.EvalSymlinks(v.Index.Bundle.Dir)
	if err != nil || !within(root, full) {
		writeJSON(w, http.StatusNotFound, errorBody{"not found"})
		return
	}

	f, err := os.Open(full)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody{"not found"})
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		writeJSON(w, http.StatusNotFound, errorBody{"not found"})
		return
	}

	// Declared, never sniffed. Without this the browser is free to decide a file
	// is HTML because it starts with a tag, which is the whole exposure this
	// list exists to close.
	w.Header().Set("X-Content-Type-Options", "nosniff")
	ext := strings.ToLower(filepath.Ext(full))
	if ct, ok := inlineTypes[ext]; ok {
		w.Header().Set("Content-Type", ct)
		if ext == ".svg" {
			w.Header().Set("Content-Security-Policy", svgPolicy)
		}
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", "attachment; filename="+strconv.Quote(filepath.Base(full)))
	}
	// ServeContent rather than a copy: it answers a range request and a
	// conditional one, which is what makes a large image or a PDF behave.
	http.ServeContent(w, r, filepath.Base(full), info.ModTime(), f)
}

// within reports whether p is root itself or inside it. Both are expected to be
// cleaned, absolute and symlink-free.
func within(root, p string) bool {
	rel, err := filepath.Rel(root, p)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
