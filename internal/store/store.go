// Package store holds one bundle's index in memory.
//
// One bundle, one index, every view derived from it. No view is privileged by
// living here: the store knows nothing about readers, boards, or tables, and
// gains nothing when one is added.
package store

import (
	"crypto/sha256"
	"encoding/hex"
	"slices"
	"strings"
	"sync"

	"github.com/agentic-wiki/wiki/bundle"
	"github.com/agentic-wiki/wiki/index"
)

// Store owns the current index and swaps in a new one on rebuild.
type Store struct {
	Dir string

	mu        sync.RWMutex
	idx       *index.Index
	version   uint64
	digest    string
	entries   map[string]string   // path to content digest, for the next comparison
	changedAt map[string]uint64   // path to the version its content last moved at
	files     map[string]struct{} // entries, plus the non-entries they link to
}

// View is the store's state at one instant.
//
// Index, Version and ChangedAt are read together under one lock because they
// describe each other. Taken separately, a caller could pair an index with a
// version from a different rebuild — and then a write guarded by "the version
// you read" would be checked against one index and applied to another, which is
// the staleness the version exists to catch.
//
// ChangedAt is replaced on every rebuild rather than mutated, so a View that has
// already been handed out stays true for as long as its holder reads it.
type View struct {
	Index   *index.Index
	Version uint64
	// ChangedAt gives the version at which each entry's content last changed.
	// Monotonic and per entry, so "changed since you last looked" is one
	// comparison per entry rather than a diff of two trees. Read-only.
	ChangedAt map[string]uint64
	// Files are the bundle paths that exist as files: every entry, plus every
	// non-entry an entry links to — an image, a contract, a spreadsheet kept
	// beside the notes about it. Read-only.
	//
	// Derived from the index rather than from the directory, which is what keeps
	// reading one a map lookup instead of a file search. A `.env` next to your
	// notes is not in here, because nothing refers to it.
	Files map[string]struct{}
}

// Open locates the bundle containing dir and builds its index.
func Open(dir string) (*Store, error) {
	s := &Store{Dir: dir}
	if _, err := s.Rebuild(); err != nil {
		return nil, err
	}
	s.Dir = s.View().Index.Bundle.Dir // the discovered root, which may be above dir
	return s, nil
}

// Rebuild re-reads the bundle from disk and swaps in the result, reporting
// whether the content actually changed.
//
// Built fully before the swap, so a failed rebuild leaves the previous index
// serving rather than replacing it with nothing: an entry saved mid-edit with
// broken frontmatter should not take the server down.
//
// The version moves only on a real change. A rebuild is cheap to trigger and
// easy to trigger spuriously — a touch, a permissions change, an editor saving
// a file it did not modify — and without this every one of those would tell
// every connected client to refetch.
func (s *Store) Rebuild() (changed bool, err error) {
	b, err := bundle.Discover(s.Dir)
	if err != nil {
		return false, err
	}
	idx, err := index.Build(b)
	if err != nil {
		return false, err
	}
	entries, err := entryDigests(idx)
	if err != nil {
		return false, err
	}
	digest := combine(entries)

	files := bundleFiles(idx)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.idx = idx // swap regardless: same content, but entries re-read from disk
	s.files = files
	if digest == s.digest {
		return false, nil
	}
	s.digest = digest
	s.version++

	// A fresh map rather than an edit, because the previous one is being read
	// without a lock by anyone still holding a View of it. An entry whose digest
	// is unchanged keeps the version it last moved at; a new one, or one whose
	// content differs, moves to now. One that is gone is simply absent.
	changedAt := make(map[string]uint64, len(entries))
	for path, digest := range entries {
		if s.entries[path] == digest {
			changedAt[path] = s.changedAt[path]
		} else {
			changedAt[path] = s.version
		}
	}
	s.entries, s.changedAt = entries, changedAt
	return true, nil
}

// View returns the current state.
//
// What it points at is immutable until the next Rebuild, which replaces the
// pointers rather than mutating what they point at. So a caller takes one View
// and reads it lock-free for as long as it likes: a request that started before
// a rebuild finishes against consistent data rather than watching the bundle
// change underneath it.
func (s *Store) View() View {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return View{Index: s.idx, Version: s.version, ChangedAt: s.changedAt, Files: s.files}
}

// bundleFiles collects every path the bundle has a file for: its entries, and
// every link target that names something other than an entry — an image, a
// diagram, a source file kept beside the notes about it.
//
// A missing `.md` is left out. That one is not a file the bundle carries, it is
// knowledge not yet written, which the format expects and the reader shows as
// such.
func bundleFiles(idx *index.Index) map[string]struct{} {
	out := make(map[string]struct{}, len(idx.Entries))
	for _, e := range idx.Entries {
		out[e.Path] = struct{}{}
	}
	for _, e := range idx.Entries {
		for _, l := range e.Links {
			if strings.HasSuffix(l.Target, ".md") {
				continue
			}
			if _, err := idx.Resolve(l.Target); err != nil {
				out[l.Target] = struct{}{}
			}
		}
	}
	return out
}

// entryDigests hashes each entry's bytes, keyed by path.
//
// Content rather than modification times, which is the whole point: a save that
// edited nothing, or a `tidy` that found nothing to fix, must not read as a
// change. Measured at roughly a third of a rebuild's cost on a 5k-entry bundle,
// paid only when something already triggered that rebuild.
func entryDigests(idx *index.Index) (map[string]string, error) {
	out := make(map[string]string, len(idx.Entries))
	for _, e := range idx.Entries {
		raw, err := e.Raw()
		if err != nil {
			return nil, err
		}
		sum := sha256.Sum256([]byte(raw))
		out[e.Path] = hex.EncodeToString(sum[:])
	}
	return out, nil
}

// combine reduces per-entry digests to one describing the whole bundle.
//
// Sorted, so the result does not depend on map or directory-walk order. Each
// path is hashed alongside its digest, so renaming an entry to a name whose
// content already exists still reads as a change.
func combine(entries map[string]string) string {
	paths := make([]string, 0, len(entries))
	for path := range entries {
		paths = append(paths, path)
	}
	slices.Sort(paths)

	h := sha256.New()
	for _, path := range paths {
		h.Write([]byte(path))
		h.Write([]byte{0})
		h.Write([]byte(entries[path]))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}
