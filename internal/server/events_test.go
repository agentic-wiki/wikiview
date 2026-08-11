package server

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"runtime"
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

// http.Server.Shutdown waits for handlers to return, and an SSE handler is
// running by design — it blocks until its client disconnects, which a client on
// a working connection never does. Without Close ending the streams, every
// shutdown waited out its full timeout and reported "context deadline exceeded".
func TestShutdownDoesNotWaitForOpenStreams(t *testing.T) {
	srv := newTestServer(t)
	ts := httptest.NewServer(srv)
	defer ts.Close()

	resp, err := ts.Client().Get(ts.URL + "/api/events")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	readEvent(t, bufio.NewReader(resp.Body)) // connected and streaming
	waitFor(t, func() bool { return srv.events.count() == 1 })

	done := make(chan struct{})
	go func() { defer close(done); srv.Close() }()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Close blocked")
	}
	// The handler must return on its own now, releasing the connection that
	// Shutdown would otherwise wait for.
	waitFor(t, func() bool { return srv.events.count() == 0 })

	// Idempotent: shutdown paths call it more than once in practice.
	srv.Close()
}

// A long-lived server accumulates connections over days. These check the two
// things that would grow without bound: the subscriber map, and the goroutines
// behind it.
func TestStreamsDoNotAccumulate(t *testing.T) {
	srv := newTestServer(t)
	ts := httptest.NewServer(srv)
	defer ts.Close()

	before := runtime.NumGoroutine()

	for range 50 {
		resp, err := ts.Client().Get(ts.URL + "/api/events")
		if err != nil {
			t.Fatal(err)
		}
		readEvent(t, bufio.NewReader(resp.Body)) // established, so it is really subscribed
		resp.Body.Close()
	}

	// Every subscription is released when its client goes.
	waitFor(t, func() bool { return srv.events.count() == 0 })

	// And so is every goroutine. Some slack for the test server's own pool.
	waitFor(t, func() bool { return runtime.NumGoroutine() <= before+5 })
	if after := runtime.NumGoroutine(); after > before+5 {
		t.Errorf("goroutines grew from %d to %d over 50 connect/disconnect cycles", before, after)
	}
}

// publish walks the subscriber map while holding its lock, so a client that
// vanishes mid-publish must not wedge it.
func TestPublishWithChurningClients(t *testing.T) {
	b := newBroker()
	stop := make(chan struct{})
	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			select {
			case <-stop:
				return
			default:
				ch := b.subscribe()
				b.unsubscribe(ch)
			}
		}
	}()

	for v := range 2000 {
		b.publish(uint64(v))
	}
	close(stop)
	<-done

	if n := b.count(); n != 0 {
		t.Errorf("%d subscribers left behind", n)
	}
}
