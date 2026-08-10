package server

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// SSE is tested over a real server and client rather than an httptest.Recorder:
// a recorder's buffer would be written by the handler goroutine and read by the
// test at the same time, which is a data race the detector rightly flags.
func liveServer(t *testing.T) (*Server, *http.Client, string) {
	t.Helper()
	srv := newTestServer(t)
	ts := httptest.NewServer(srv)
	t.Cleanup(ts.Close)
	return srv, ts.Client(), ts.URL
}

// readEvent reads one `data:` line, so the test blocks on the stream rather than
// on a sleep.
func readEvent(t *testing.T, r *bufio.Reader) string {
	t.Helper()
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatalf("reading the stream: %v", err)
		}
		if v, ok := strings.CutPrefix(strings.TrimSpace(line), "data: "); ok {
			return v
		}
	}
}

// A client connecting after a change must learn it is stale without waiting for
// the next one, so the stream opens with the current version.
func TestEventsSendCurrentVersionOnConnect(t *testing.T) {
	_, client, url := liveServer(t)
	resp, err := client.Get(url + "/api/events")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("Content-Type=%q", ct)
	}
	if got := readEvent(t, bufio.NewReader(resp.Body)); got != "1" {
		t.Errorf("stream opened with version %q, want the current one", got)
	}
}

// The event carries a version, never a payload: the client refetches, so one
// that missed ten messages pulls once and is correct again.
func TestEventsCarryVersionsNotPayloads(t *testing.T) {
	srv, client, url := liveServer(t)
	resp, err := client.Get(url + "/api/events")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	r := bufio.NewReader(resp.Body)
	readEvent(t, r) // the opening version

	waitFor(t, func() bool { return srv.events.count() == 1 })
	srv.Notify(7)

	if got := readEvent(t, r); got != "7" {
		t.Errorf("received %q, want the published version", got)
	}

	// Closing the client releases the subscription.
	resp.Body.Close()
	waitFor(t, func() bool { return srv.events.count() == 0 })
}

// A wedged client must not stall a rebuild or every other client. Versions are
// absolute, so dropping an older pending one loses nothing.
func TestPublishNeverBlocksOnASlowClient(t *testing.T) {
	b := newBroker()
	stuck := b.subscribe() // never read from
	defer b.unsubscribe(stuck)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for v := range 100 {
			b.publish(uint64(v))
		}
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("publish blocked on a client that never reads")
	}
	// The client holds the newest version, not the first one it missed.
	select {
	case v := <-stuck:
		if v != 99 {
			t.Errorf("pending version=%d, want the newest (99)", v)
		}
	default:
		t.Error("the slow client should still have a version waiting")
	}
}

// waitFor polls until cond holds, so tests do not depend on a fixed sleep.
func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatal("condition not met within the deadline")
}
