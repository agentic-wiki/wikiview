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
	"sync"

	"github.com/agentic-wiki/wiki/bundle"
	"github.com/agentic-wiki/wiki/index"
)

// Store owns the current index and swaps in a new one on rebuild.
type Store struct {
	Dir string

	mu      sync.RWMutex
	idx     *index.Index
	version uint64
	digest  string
}

// Open locates the bundle containing dir and builds its index.
func Open(dir string) (*Store, error) {
	s := &Store{Dir: dir}
	if _, err := s.Rebuild(); err != nil {
		return nil, err
	}
	s.Dir = s.Snapshot().Bundle.Dir // the discovered root, which may be above dir
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
	digest, err := contentDigest(idx)
	if err != nil {
		return false, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.idx = idx // swap regardless: same content, but entries re-read from disk
	if digest == s.digest {
		return false, nil
	}
	s.digest = digest
	s.version++
	return true, nil
}

// Snapshot returns the current index.
//
// The returned index is immutable until the next Rebuild, and a Rebuild replaces
// the pointer rather than mutating what it points at. So a caller takes one
// snapshot, then reads it lock-free for as long as it likes: a request that
// started before a rebuild finishes against consistent data rather than seeing
// the bundle change underneath it.
func (s *Store) Snapshot() *index.Index {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.idx
}

// Version identifies the current content. It moves when the bundle's content
// does, and is what clients compare against to know they are stale.
func (s *Store) Version() uint64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.version
}

// contentDigest hashes every entry's path and bytes.
//
// Content rather than modification times, which is the whole point: a save that
// edited nothing, or a `tidy` that found nothing to fix, must not read as a
// change. Measured at roughly a third of a rebuild's cost on a 5k-entry bundle,
// paid only when something already triggered that rebuild.
//
// Paths are sorted so the digest does not depend on directory walk order.
func contentDigest(idx *index.Index) (string, error) {
	paths := make([]string, 0, len(idx.Entries))
	for _, e := range idx.Entries {
		paths = append(paths, e.Path)
	}
	slices.Sort(paths)

	h := sha256.New()
	for _, p := range paths {
		e, err := idx.Resolve(p)
		if err != nil {
			return "", err
		}
		raw, err := e.Raw()
		if err != nil {
			return "", err
		}
		// The path is hashed alongside the body so that renaming an entry to a
		// name whose content already exists still reads as a change.
		h.Write([]byte(p))
		h.Write([]byte{0})
		h.Write([]byte(raw))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
