package watch

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"testing"
	"time"
)

// quiet is short so tests are quick, but long enough that one save's events
// still land inside a single window.
const quiet = 60 * time.Millisecond

// start runs a watcher over a fresh directory and returns it with a counter of
// how many change notifications have fired.
//
// Skipped on Windows, deliberately and at the source rather than in CI, so it
// applies to anyone running the suite there.
//
// These tests assert on *counts within a time window*: write some files, wait
// out the debounce, expect exactly one notification. That depends on the
// filesystem delivering events promptly and coalescing them the way inotify
// does. Windows delivers through a different mechanism with its own batching
// and latency, so the counts become a race — and a test that fails
// intermittently is worse than one that does not run, because it trains people
// to re-run rather than to read.
//
// What is lost is coverage of the debounce arithmetic, which is
// platform-independent. What is kept is TestStopsOnContextCancel, which does not
// use this helper and does verify the watcher shuts down cleanly on Windows.
func start(t *testing.T) (dir string, fired *atomic.Int64) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("event timing and coalescing differ here; these assert on counts within a window")
	}
	dir = t.TempDir()
	fired = &atomic.Int64{}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		if err := Watch(ctx, dir, quiet, func() { fired.Add(1) }); err != nil {
			t.Error(err)
		}
	}()
	t.Cleanup(func() { cancel(); <-done })

	time.Sleep(quiet) // let the watch register before the test writes
	return dir, fired
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// settle waits out the quiet period plus margin, so a pending batch has fired.
func settle() { time.Sleep(quiet * 4) }

func TestNotifiesOnMarkdownChange(t *testing.T) {
	dir, fired := start(t)
	write(t, filepath.Join(dir, "a.md"), "hello")
	settle()
	if got := fired.Load(); got != 1 {
		t.Errorf("fired %d times, want 1", got)
	}
}

// The rule that makes the whole thing affordable: one save is several events,
// and a `tidy --all` is hundreds across many files. All of it is one change.
func TestABatchIsOneChange(t *testing.T) {
	dir, fired := start(t)
	for i := range 40 {
		write(t, filepath.Join(dir, "f", string(rune('a'+i%20))+".md"), "x")
		os.Chmod(filepath.Join(dir, "f", string(rune('a'+i%20))+".md"), 0o644)
	}
	settle()
	if got := fired.Load(); got != 1 {
		t.Errorf("a batch of 40 writes fired %d times, want 1", got)
	}
}

// Anything that cannot change what the bundle contains must not cost a rebuild:
// editor swap files, OS metadata, `.git` writes, and the atomic writes' own
// temp files would each otherwise trigger one.
func TestIrrelevantWritesDoNotNotify(t *testing.T) {
	dir, fired := start(t)
	write(t, filepath.Join(dir, "notes.txt"), "not markdown")
	write(t, filepath.Join(dir, "LICENSE"), "no extension")
	write(t, filepath.Join(dir, ".hidden.md"), "hidden")
	write(t, filepath.Join(dir, ".wiki-1234.tmp"), "an atomic write in progress")
	write(t, filepath.Join(dir, ".git", "HEAD"), "ref: refs/heads/main")
	settle()
	if got := fired.Load(); got != 0 {
		t.Errorf("fired %d times for writes that change nothing", got)
	}
	// …and the watcher is still alive for real changes.
	write(t, filepath.Join(dir, "real.md"), "yes")
	settle()
	if got := fired.Load(); got != 1 {
		t.Errorf("fired %d times after a real change, want 1", got)
	}
}

// wiki.toml decides what counts as an entry and which types are valid, so a
// change to it changes the bundle even though it is not markdown.
func TestConfigChangeNotifies(t *testing.T) {
	dir, fired := start(t)
	write(t, filepath.Join(dir, "wiki.toml"), "spec = \"0.1\"\n")
	settle()
	if got := fired.Load(); got != 1 {
		t.Errorf("fired %d times for a wiki.toml change, want 1", got)
	}
}

// fsnotify is not recursive, so a folder created while running has to be picked
// up or everything filed into it afterwards is invisible.
func TestNewDirectoryIsWatched(t *testing.T) {
	dir, fired := start(t)
	sub := filepath.Join(dir, "new-folder")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	settle()
	before := fired.Load()

	write(t, filepath.Join(sub, "inside.md"), "content")
	settle()
	if got := fired.Load(); got <= before {
		t.Errorf("a write inside a newly created folder did not notify (fired %d, was %d)", got, before)
	}
}

func TestStopsOnContextCancel(t *testing.T) {
	dir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- Watch(ctx, dir, quiet, func() {}) }()

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("Watch returned %v, want nil on cancel", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Watch did not return after its context was cancelled")
	}
}

// fsnotify is not recursive, so a watch is added per directory and never
// explicitly removed. A long-lived server over a churning bundle would leak
// them if the kernel did not drop watches for deleted directories.
func TestWatchesDoNotAccumulate(t *testing.T) {
	dir, fired := start(t)

	// A directory created and destroyed repeatedly, as a build or a sync would.
	for i := range 30 {
		sub := filepath.Join(dir, "tmp"+string(rune('a'+i%10)))
		if err := os.MkdirAll(sub, 0o755); err != nil {
			t.Fatal(err)
		}
		write(t, filepath.Join(sub, "x.md"), "x")
		if err := os.RemoveAll(sub); err != nil {
			t.Fatal(err)
		}
	}
	settle()

	// The watcher is internal, so this asserts the observable consequence: it is
	// still alive and still reporting, rather than having hit a watch limit.
	before := fired.Load()
	write(t, filepath.Join(dir, "after.md"), "still working")
	settle()
	if fired.Load() <= before {
		t.Error("the watcher stopped reporting after directory churn")
	}
}
