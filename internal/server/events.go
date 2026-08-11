package server

import (
	"fmt"
	"net/http"
	"sync"
)

// broker fans a version number out to connected clients.
//
// A version, never a payload. Sending the changed entry would mean the server
// deciding what each client cares about, and a client that missed one message
// being permanently behind. A version says only "you are stale"; the client
// refetches what it is actually looking at, so a client that missed ten events
// pulls once and is correct again. There is no replay to design and no ordering
// to get wrong.
type broker struct {
	mu      sync.Mutex
	clients map[chan uint64]struct{}
	// closed when the server is shutting down. An SSE handler blocks until its
	// client goes away, and a client on a working connection never does — so
	// without a second thing to wait on, every open stream would hold
	// http.Server.Shutdown open until its timeout expired.
	closing chan struct{}
}

func newBroker() *broker {
	return &broker{clients: map[chan uint64]struct{}{}, closing: make(chan struct{})}
}

func (b *broker) subscribe() chan uint64 {
	// Buffered by one: a client that is mid-write when a version arrives gets
	// the newer number without the publisher waiting for it. Coalescing is
	// correct here — versions are absolute, not increments, so the latest one
	// makes any it replaced irrelevant.
	ch := make(chan uint64, 1)
	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

func (b *broker) unsubscribe(ch chan uint64) {
	b.mu.Lock()
	delete(b.clients, ch)
	b.mu.Unlock()
}

// publish never blocks: a slow or wedged client must not stall a rebuild or
// every other client. It drops the older pending version instead, which loses
// nothing because the newer one supersedes it.
func (b *broker) publish(version uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.clients {
		select {
		case ch <- version:
		default:
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- version:
			default:
			}
		}
	}
}

func (b *broker) count() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.clients)
}

// Notify publishes the store's current version to every connected client.
func (s *Server) Notify(version uint64) { s.events.publish(version) }

// Close ends every open event stream.
//
// Called before http.Server.Shutdown, which waits for handlers to return: an
// SSE handler is by design still running, so without this it waits out the
// whole shutdown timeout and reports "context deadline exceeded" on every exit.
// Safe to call more than once.
func (s *Server) Close() {
	s.events.mu.Lock()
	defer s.events.mu.Unlock()
	select {
	case <-s.events.closing:
	default:
		close(s.events.closing)
	}
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Proxies that buffer would defeat the point of streaming.
	w.Header().Set("X-Accel-Buffering", "no")

	ch := s.events.subscribe()
	defer s.events.unsubscribe(ch)

	// The current version up front, so a client that connects after a change
	// discovers it is stale without waiting for the next one.
	writeEvent(w, flusher, s.store.Version())

	for {
		select {
		case <-r.Context().Done():
			return // the client went away
		case <-s.events.closing:
			return // the server is shutting down; end the stream so it can
		case v := <-ch:
			writeEvent(w, flusher, v)
		}
	}
}

func writeEvent(w http.ResponseWriter, flusher http.Flusher, version uint64) {
	fmt.Fprintf(w, "event: version\ndata: %d\n\n", version)
	flusher.Flush()
}
