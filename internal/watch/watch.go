// Package watch reports that a bundle changed, without saying how.
//
// It deliberately carries no payload: the store rebuilds and decides whether
// anything actually changed. A watcher that tried to describe the change would
// be a second, worse index.
package watch

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
)

// DefaultQuiet is how long the filesystem must be still before a batch of
// events counts as finished.
//
// One save is several events — a write, often a chmod, and for an editor or
// `wiki` itself a temp file and a rename. A `tidy --all` is hundreds of them
// across many files. All of it is one logical change, and rebuilding per event
// would rebuild the bundle dozens of times and tell clients so.
const DefaultQuiet = 150 * time.Millisecond

// Watch calls onChange after each quiet period in which something relevant
// changed, until ctx is done. It blocks.
func Watch(ctx context.Context, root string, quiet time.Duration, onChange func()) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer w.Close()

	if err := addTree(w, root); err != nil {
		return err
	}

	// Stopped, not ticking: a timer that only runs while something is pending
	// costs nothing in the common case, which is an idle bundle.
	timer := time.NewTimer(quiet)
	if !timer.Stop() {
		<-timer.C
	}
	pending := false

	for {
		select {
		case <-ctx.Done():
			return nil

		case event, ok := <-w.Events:
			if !ok {
				return nil
			}
			// A new directory has to be watched explicitly; fsnotify is not
			// recursive. Without this, anything created inside a folder added
			// while running would be invisible.
			if event.Has(fsnotify.Create) && isDir(event.Name) {
				_ = addTree(w, event.Name)
			}
			if !relevant(event.Name) {
				continue
			}
			if pending && !timer.Stop() {
				<-timer.C
			}
			timer.Reset(quiet)
			pending = true

		case <-timer.C:
			pending = false
			onChange()

		case _, ok := <-w.Errors:
			if !ok {
				return nil
			}
			// A watch error is not worth taking the server down for: the index
			// still serves, and the next event rebuilds it.
		}
	}
}

// relevant reports whether a path can change what the bundle contains.
//
// Only markdown and the config: an editor's swap files, a `.git` write, an OS
// metadata file, and the atomic writes' own `.wiki-*.tmp` would otherwise each
// cost a full rebuild and a version bump for a bundle that did not change.
func relevant(path string) bool {
	base := filepath.Base(path)
	if strings.HasPrefix(base, ".") {
		return false
	}
	return strings.HasSuffix(base, ".md") || base == "wiki.toml"
}

// addTree watches root and every directory under it, skipping hidden ones so
// `.git` does not generate events for work that is not the bundle's content.
func addTree(w *fsnotify.Watcher, root string) error {
	return filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || !d.IsDir() {
			return nil // an unreadable subtree is not fatal; watch what we can
		}
		if path != root && strings.HasPrefix(d.Name(), ".") {
			return fs.SkipDir
		}
		_ = w.Add(path)
		return nil
	})
}

// isDir asks the filesystem rather than guessing from the name: an extensionless
// path is not evidence of a directory, and treating LICENSE or Makefile as one
// would add a watch that never fires and skip a rebuild that should happen.
func isDir(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}
