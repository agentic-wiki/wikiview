// Package store holds one bundle's index in memory.
//
// One bundle, one index, every view derived from it. No view is privileged by
// living here: the store knows nothing about readers, boards, or tables, and
// gains nothing when one is added.
package store

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
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

	// Why the version last moved, for whoever has to account for it. Everything
	// else here describes the bundle; these two describe the step that got to it.
	config      string   // wiki.toml's digest, for the next comparison
	removed     []string // entries the last rebuild found gone
	configMoved bool     // whether wiki.toml was what changed
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
	// Removed lists the entries the rebuild that produced this version found
	// gone, and ConfigMoved says whether wiki.toml was what changed. Neither can
	// be worked out from anything else here — a deleted entry is absent from
	// ChangedAt rather than marked in it — and between them every version has a
	// reason that can be named. Read-only.
	Removed     []string
	ConfigMoved bool
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
	config := configDigest(b.Dir)
	digest := combine(entries, config)

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

	// What is *gone* is nowhere in the map above, so it has to be worked out
	// while both sides are still in hand. A version that moved because entries
	// were deleted otherwise has nothing to point at and reads as unexplained.
	removed := []string{}
	for path := range s.entries {
		if _, still := entries[path]; !still {
			removed = append(removed, path)
		}
	}
	slices.Sort(removed)

	s.entries, s.changedAt = entries, changedAt
	s.removed, s.configMoved = removed, config != s.config
	s.config = config
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
	return View{
		Index:       s.idx,
		Version:     s.version,
		ChangedAt:   s.changedAt,
		Files:       s.files,
		Removed:     s.removed,
		ConfigMoved: s.configMoved,
	}
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

// configDigest hashes wiki.toml, or "" when it cannot be read.
//
// The config is part of what the server answers with — which boards exist comes
// from it — so a change to it is a change clients have to hear about. Without
// this, declaring a board rebuilt the index and told nobody, and the board only
// appeared for whoever reloaded next.
//
// Unreadable is a digest of its own rather than an error: the watcher fires
// mid-write often enough, and a rebuild that fails over a config file the reader
// does not need would take the bundle down for a moment.
func configDigest(dir string) string {
	raw, err := os.ReadFile(filepath.Join(dir, "wiki.toml"))
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

// combine reduces per-entry digests and the config's to one describing the whole
// bundle.
//
// Sorted, so the result does not depend on map or directory-walk order. Each
// path is hashed alongside its digest, so renaming an entry to a name whose
// content already exists still reads as a change.
func combine(entries map[string]string, config string) string {
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
	h.Write([]byte(config))
	return hex.EncodeToString(h.Sum(nil))
}
