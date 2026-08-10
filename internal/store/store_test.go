package store

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func writeBundle(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	write(t, dir, "wiki.toml", "spec = \"0.1\"\n")
	write(t, dir, "index.md", "---\nokf_version: \"0.1\"\n---\nhome [a](./notes/a.md)\n")
	write(t, dir, "notes/a.md", "---\ntype: note\n---\nbody\n")
	return dir
}

func write(t *testing.T, dir, name, content string) {
	t.Helper()
	p := filepath.Join(dir, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestOpenAndRebuild(t *testing.T) {
	dir := writeBundle(t)
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got := len(s.Snapshot().Entries); got != 2 {
		t.Fatalf("entries=%d, want 2", got)
	}

	write(t, dir, "notes/b.md", "---\ntype: note\n---\nnew\n")
	if got := len(s.Snapshot().Entries); got != 2 {
		t.Errorf("a snapshot must not change under the caller: entries=%d", got)
	}
	if _, err := s.Rebuild(); err != nil {
		t.Fatal(err)
	}
	if got := len(s.Snapshot().Entries); got != 3 {
		t.Errorf("after rebuild entries=%d, want 3", got)
	}
}

// Open is given a directory to start from; the bundle root may be above it.
func TestOpenWalksUpToTheBundleRoot(t *testing.T) {
	dir := writeBundle(t)
	deep := filepath.Join(dir, "notes")
	s, err := Open(deep)
	if err != nil {
		t.Fatal(err)
	}
	if realpath(t, s.Dir) != realpath(t, dir) {
		t.Errorf("Dir=%q, want the bundle root %q", s.Dir, dir)
	}
}

// An entry saved mid-edit should not take the server down.
func TestFailedRebuildKeepsServing(t *testing.T) {
	dir := writeBundle(t)
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	before := s.Snapshot()

	write(t, dir, "wiki.toml", "spec = \"0.1\"\nthis is not toml\n")
	if _, err := s.Rebuild(); err == nil {
		t.Fatal("a malformed wiki.toml should fail the rebuild")
	}
	if s.Snapshot() != before {
		t.Error("a failed rebuild replaced the index it should have left alone")
	}
	if len(s.Snapshot().Entries) != 2 {
		t.Error("the previous index should still answer")
	}
}

// A rebuild swaps a pointer; readers hold whichever they took. Run with -race.
func TestConcurrentSnapshotAndRebuild(t *testing.T) {
	s, err := Open(writeBundle(t))
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 200 {
				if idx := s.Snapshot(); idx == nil || len(idx.Entries) == 0 {
					t.Error("snapshot returned an unusable index")
					return
				}
			}
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for range 50 {
			if _, err := s.Rebuild(); err != nil {
				t.Error(err)
				return
			}
		}
	}()
	wg.Wait()
}

func realpath(t *testing.T, p string) string {
	t.Helper()
	r, err := filepath.EvalSymlinks(p)
	if err != nil {
		return p
	}
	return r
}

// The version is what clients compare against, so it has to mean "the content
// differs" and nothing else. A rebuild is easy to trigger spuriously.
func TestVersionMovesOnlyOnRealChange(t *testing.T) {
	dir := writeBundle(t)
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	v0 := s.Version()

	// A rebuild with nothing changed at all.
	if changed, err := s.Rebuild(); err != nil || changed {
		t.Errorf("an unchanged rebuild reported changed=%v err=%v", changed, err)
	}
	if s.Version() != v0 {
		t.Errorf("version moved without a change: %d -> %d", v0, s.Version())
	}

	// A save that rewrites a file with the content it already had — an editor
	// saving an untouched buffer, or a tidy that found nothing to fix.
	write(t, dir, "notes/a.md", "---\ntype: note\n---\nbody\n")
	if changed, _ := s.Rebuild(); changed {
		t.Error("rewriting identical content reported a change")
	}
	if s.Version() != v0 {
		t.Errorf("a no-op save moved the version: %d -> %d", v0, s.Version())
	}

	// A real edit.
	write(t, dir, "notes/a.md", "---\ntype: note\n---\nedited\n")
	if changed, err := s.Rebuild(); err != nil || !changed {
		t.Fatalf("a real edit reported changed=%v err=%v", changed, err)
	}
	if s.Version() <= v0 {
		t.Errorf("version did not move on a real change: %d", s.Version())
	}
}

// Renaming an entry changes the bundle even when the bytes are all still there,
// so the digest covers paths as well as content.
func TestVersionMovesOnRename(t *testing.T) {
	dir := writeBundle(t)
	s, _ := Open(dir)
	v0 := s.Version()

	if err := os.Rename(filepath.Join(dir, "notes", "a.md"), filepath.Join(dir, "notes", "b.md")); err != nil {
		t.Fatal(err)
	}
	if changed, _ := s.Rebuild(); !changed {
		t.Error("a rename with identical content should still be a change")
	}
	if s.Version() == v0 {
		t.Error("version did not move on a rename")
	}
}

// A failed rebuild must not move the version either: clients would refetch and
// receive exactly what they already had.
func TestFailedRebuildDoesNotMoveVersion(t *testing.T) {
	dir := writeBundle(t)
	s, _ := Open(dir)
	v0 := s.Version()
	write(t, dir, "wiki.toml", "spec = \"0.1\"\nnot toml at all\n")
	if _, err := s.Rebuild(); err == nil {
		t.Fatal("expected the rebuild to fail")
	}
	if s.Version() != v0 {
		t.Errorf("a failed rebuild moved the version: %d -> %d", v0, s.Version())
	}
}
