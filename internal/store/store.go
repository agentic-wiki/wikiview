// Package store holds one bundle's index in memory.
//
// One bundle, one index, every view derived from it. No view is privileged by
// living here: the store knows nothing about readers, boards, or tables, and
// gains nothing when one is added.
package store

import (
	"sync"

	"github.com/agentic-wiki/wiki/bundle"
	"github.com/agentic-wiki/wiki/index"
)

// Store owns the current index and swaps in a new one on rebuild.
type Store struct {
	Dir string

	mu  sync.RWMutex
	idx *index.Index
}

// Open locates the bundle containing dir and builds its index.
func Open(dir string) (*Store, error) {
	s := &Store{Dir: dir}
	if err := s.Rebuild(); err != nil {
		return nil, err
	}
	s.Dir = s.Snapshot().Bundle.Dir // the discovered root, which may be above dir
	return s, nil
}

// Rebuild re-reads the bundle from disk and swaps in the result.
//
// Built fully before the swap, so a failed rebuild leaves the previous index
// serving rather than replacing it with nothing: an entry saved mid-edit with
// broken frontmatter should not take the server down.
func (s *Store) Rebuild() error {
	b, err := bundle.Discover(s.Dir)
	if err != nil {
		return err
	}
	idx, err := index.Build(b)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.idx = idx
	s.mu.Unlock()
	return nil
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
