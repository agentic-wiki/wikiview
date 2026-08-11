package server

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"
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

// activeTypes are markup a browser would execute if it rendered it. They are
// downloaded whatever their bytes look like: an entry's HTML is deliberately
// not rendered, and serving one from this origin as text/html would hand back
// the thing that decision closed off.
var activeTypes = map[string]bool{
	".html":  true,
	".htm":   true,
	".xhtml": true,
	".shtml": true,
	".mhtml": true,
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
	// is HTML because it starts with a tag, which is the whole exposure the
	// rules below exist to close.
	w.Header().Set("X-Content-Type-Options", "nosniff")
	ext := strings.ToLower(filepath.Ext(full))
	switch {
	case activeTypes[ext]:
		// Markup the browser would execute if it were allowed to render it.
		download(w, full)
	case inlineTypes[ext] != "":
		w.Header().Set("Content-Type", inlineTypes[ext])
		if ext == ".svg" {
			w.Header().Set("Content-Security-Policy", svgPolicy)
		}
	case isText(f):
		// A `.sol`, a `.rs`, a `.zig`: readable, and there is no list of every
		// extension anyone will ever keep beside their notes. Served as plain
		// text, which nosniff holds the browser to, so a `.js` displays as
		// source rather than running.
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	default:
		download(w, full)
	}
	// ServeContent rather than a copy: it answers a range request and a
	// conditional one, which is what makes a large image or a PDF behave.
	http.ServeContent(w, r, filepath.Base(full), info.ModTime(), f)
}

func download(w http.ResponseWriter, full string) {
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename="+strconv.Quote(filepath.Base(full)))
}

// isText reports whether a file reads as text, leaving it positioned back at
// the start.
//
// Asking the bytes rather than keeping a list of every extension a person might
// store beside their notes. A source file is worth showing whatever it is
// called, and the list would always be missing the language someone actually
// uses.
//
// A NUL byte means binary in practice: text encodings do not contain one, and
// almost every binary format does within the first block. Valid UTF-8 does the
// rest. Nothing here decides whether the content is *safe* to display, which is
// the job of the extension rules above — a file can be perfectly good UTF-8 and
// still be HTML.
func isText(f *os.File) bool {
	var buf [512]byte
	n, err := io.ReadFull(f, buf[:])
	if _, seekErr := f.Seek(0, io.SeekStart); seekErr != nil {
		return false
	}
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return false
	}
	head := buf[:n]
	if bytes.IndexByte(head, 0) >= 0 {
		return false
	}
	// A 512-byte window can end mid-rune, which is not a reason to call a file
	// binary. Drop a trailing partial character before validating.
	for len(head) > 0 && !utf8.Valid(head) {
		if r, size := utf8.DecodeLastRune(head); r != utf8.RuneError || size != 1 {
			break
		}
		head = head[:len(head)-1]
		if n-len(head) > utf8.UTFMax {
			return false // more than one rune's worth of junk at the end
		}
	}
	return utf8.Valid(head)
}

// within reports whether p is root itself or inside it. Both are expected to be
// cleaned, absolute and symlink-free.
func within(root, p string) bool {
	rel, err := filepath.Rel(root, p)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
