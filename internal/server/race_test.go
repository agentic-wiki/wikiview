package server

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// Reads, a write and a rebuild at once, which is what a bundle an agent is
// editing looks like from here.
//
// `bundle.DecodeTool` decodes through a `toml.MetaData` that records what it has
// read, so it writes to the thing it reads from: two handlers decoding one
// bundle took the process down with "concurrent map writes". Not theoretical —
// it killed a server with a board open while the tree refetched beside it.
func TestConcurrentRequestsAndRebuilds(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)

	get := func(path string) {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Errorf("GET %s = %d", path, rec.Code)
		}
	}

	var wg sync.WaitGroup
	run := func(f func()) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			f()
		}()
	}

	for range 8 {
		run(func() { get("/api/bundle") })
		run(func() { get("/api/board/backlog") })
		run(func() { get("/api/board/root") })
		run(func() { get("/api/tree") })
		run(func() { get("/api/entry/backlog/a.md") })
		// The watcher, which rebuilds under the readers rather than waiting for
		// them. A rebuild that finds nothing changed still swaps the index.
		run(func() {
			if _, err := srv.store.Rebuild(); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
}

// Rebuilding and announcing are one step, because taken apart two of them
// overlapping each read the version *after* both had landed: one version was
// announced twice and the one between it never at all.
func TestOverlappingRebuildsAnnounceEachVersionOnce(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	dir := srv.store.View().Index.Bundle.Dir

	seen := srv.events.subscribe()
	defer srv.events.unsubscribe(seen)
	// Read as fast as they arrive, so nothing is coalesced away by the broker's
	// one-slot buffer and every announcement is counted.
	var mu sync.Mutex
	var announced []uint64
	done := make(chan struct{})
	go func() {
		defer close(done)
		for v := range seen {
			mu.Lock()
			announced = append(announced, v)
			mu.Unlock()
		}
	}()

	// Each writer changes the bundle and then rebuilds, so every rebuild has a
	// real change to find and every one of them moves the version.
	var wg sync.WaitGroup
	const writers = 6
	for i := range writers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			name := filepath.Join(dir, "backlog", fmt.Sprintf("w%d.md", i))
			if err := os.WriteFile(name, fmt.Appendf(nil, "---\ntype: task\nstatus: todo\n---\n%d\n", i), 0o644); err != nil {
				t.Error(err)
				return
			}
			if err := srv.RebuildAndNotify(); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	srv.events.unsubscribe(seen)
	close(seen)
	<-done

	mu.Lock()
	defer mu.Unlock()
	// However the writes interleaved, the versions announced are consecutive and
	// each appears once: no repeat, and no gap where one went unreported.
	if len(announced) == 0 {
		t.Fatal("nothing was announced")
	}
	for i, v := range announced {
		if want := announced[0] + uint64(i); v != want {
			t.Fatalf("announced %v, want consecutive versions from %d", announced, announced[0])
		}
	}
	if last := srv.store.View().Version; announced[len(announced)-1] != last {
		t.Errorf("announced up to v%d, but the store is at v%d", announced[len(announced)-1], last)
	}
}
