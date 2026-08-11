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
	if got := len(s.View().Index.Entries); got != 2 {
		t.Fatalf("entries=%d, want 2", got)
	}

	write(t, dir, "notes/b.md", "---\ntype: note\n---\nnew\n")
	if got := len(s.View().Index.Entries); got != 2 {
		t.Errorf("a snapshot must not change under the caller: entries=%d", got)
	}
	if _, err := s.Rebuild(); err != nil {
		t.Fatal(err)
	}
	if got := len(s.View().Index.Entries); got != 3 {
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
	before := s.View().Index

	write(t, dir, "wiki.toml", "spec = \"0.1\"\nthis is not toml\n")
	if _, err := s.Rebuild(); err == nil {
		t.Fatal("a malformed wiki.toml should fail the rebuild")
	}
	if s.View().Index != before {
		t.Error("a failed rebuild replaced the index it should have left alone")
	}
	if len(s.View().Index.Entries) != 2 {
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
				if idx := s.View().Index; idx == nil || len(idx.Entries) == 0 {
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
	v0 := s.View().Version

	// A rebuild with nothing changed at all.
	if changed, err := s.Rebuild(); err != nil || changed {
		t.Errorf("an unchanged rebuild reported changed=%v err=%v", changed, err)
	}
	if s.View().Version != v0 {
		t.Errorf("version moved without a change: %d -> %d", v0, s.View().Version)
	}

	// A save that rewrites a file with the content it already had — an editor
	// saving an untouched buffer, or a tidy that found nothing to fix.
	write(t, dir, "notes/a.md", "---\ntype: note\n---\nbody\n")
	if changed, _ := s.Rebuild(); changed {
		t.Error("rewriting identical content reported a change")
	}
	if s.View().Version != v0 {
		t.Errorf("a no-op save moved the version: %d -> %d", v0, s.View().Version)
	}

	// A real edit.
	write(t, dir, "notes/a.md", "---\ntype: note\n---\nedited\n")
	if changed, err := s.Rebuild(); err != nil || !changed {
		t.Fatalf("a real edit reported changed=%v err=%v", changed, err)
	}
	if s.View().Version <= v0 {
		t.Errorf("version did not move on a real change: %d", s.View().Version)
	}
}

// Renaming an entry changes the bundle even when the bytes are all still there,
// so the digest covers paths as well as content.
func TestVersionMovesOnRename(t *testing.T) {
	dir := writeBundle(t)
	s, _ := Open(dir)
	v0 := s.View().Version

	if err := os.Rename(filepath.Join(dir, "notes", "a.md"), filepath.Join(dir, "notes", "b.md")); err != nil {
		t.Fatal(err)
	}
	if changed, _ := s.Rebuild(); !changed {
		t.Error("a rename with identical content should still be a change")
	}
	if s.View().Version == v0 {
		t.Error("version did not move on a rename")
	}
}

// A failed rebuild must not move the version either: clients would refetch and
// receive exactly what they already had.
func TestFailedRebuildDoesNotMoveVersion(t *testing.T) {
	dir := writeBundle(t)
	s, _ := Open(dir)
	v0 := s.View().Version
	write(t, dir, "wiki.toml", "spec = \"0.1\"\nnot toml at all\n")
	if _, err := s.Rebuild(); err == nil {
		t.Fatal("expected the rebuild to fail")
	}
	if s.View().Version != v0 {
		t.Errorf("a failed rebuild moved the version: %d -> %d", v0, s.View().Version)
	}
}

// The point of tracking per entry: a change to one entry must not read as a
// change to every other, or "what changed since you looked" degrades to "the
// bundle changed" and marks the whole tree.
func TestChangedAtMovesOnlyForEntriesThatChanged(t *testing.T) {
	dir := writeBundle(t)
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	before := s.View()

	write(t, dir, "notes/a.md", "---\ntype: note\n---\nedited\n")
	changed, err := s.Rebuild()
	if err != nil {
		t.Fatal(err)
	}
	if !changed {
		t.Fatal("an edit did not register as a change")
	}
	after := s.View()

	if after.ChangedAt["/notes/a.md"] != after.Version {
		t.Errorf("edited entry changedAt=%d, want the current version %d",
			after.ChangedAt["/notes/a.md"], after.Version)
	}
	if got, want := after.ChangedAt["/index.md"], before.ChangedAt["/index.md"]; got != want {
		t.Errorf("untouched entry changedAt=%d, want it to stay at %d", got, want)
	}
}

// A rebuild that finds nothing different must not move anything, or every save
// of an unrelated file would mark the entry you are reading.
func TestChangedAtHoldsStillWhenNothingChanged(t *testing.T) {
	dir := writeBundle(t)
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	before := s.View()

	// Rewriting identical bytes is what an editor saving an unmodified buffer
	// does, and what `tidy` does when it finds nothing to fix.
	write(t, dir, "notes/a.md", "---\ntype: note\n---\nbody\n")
	if changed, err := s.Rebuild(); err != nil {
		t.Fatal(err)
	} else if changed {
		t.Fatal("rewriting identical content registered as a change")
	}

	after := s.View()
	if after.Version != before.Version {
		t.Errorf("version moved from %d to %d with no change", before.Version, after.Version)
	}
	for path, at := range before.ChangedAt {
		if after.ChangedAt[path] != at {
			t.Errorf("%s changedAt moved from %d to %d with no change", path, at, after.ChangedAt[path])
		}
	}
}

// A new entry has changed by definition, and a removed one leaves nothing
// behind to compare against.
func TestChangedAtCoversAddedAndRemoved(t *testing.T) {
	dir := writeBundle(t)
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}

	write(t, dir, "notes/b.md", "---\ntype: note\n---\nnew\n")
	if _, err := s.Rebuild(); err != nil {
		t.Fatal(err)
	}
	added := s.View()
	if added.ChangedAt["/notes/b.md"] != added.Version {
		t.Errorf("a new entry changedAt=%d, want the current version %d",
			added.ChangedAt["/notes/b.md"], added.Version)
	}

	if err := os.Remove(filepath.Join(dir, "notes", "b.md")); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Rebuild(); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.View().ChangedAt["/notes/b.md"]; ok {
		t.Error("a removed entry is still tracked")
	}
}

// A View is read without a lock for as long as its holder likes, so a rebuild
// must not edit the map it already handed out.
func TestViewIsNotMutatedByALaterRebuild(t *testing.T) {
	dir := writeBundle(t)
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	held := s.View()
	was := held.ChangedAt["/notes/a.md"]

	write(t, dir, "notes/a.md", "---\ntype: note\n---\nedited\n")
	if _, err := s.Rebuild(); err != nil {
		t.Fatal(err)
	}

	if held.ChangedAt["/notes/a.md"] != was {
		t.Error("a rebuild changed a map that had already been handed out")
	}
	if held.Version == s.View().Version {
		t.Error("the held view followed the store forward instead of staying still")
	}
}
