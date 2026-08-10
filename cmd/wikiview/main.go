// Command wikiview serves an agentic-wiki bundle over HTTP.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/agentic-wiki/wikiview/internal/server"
	"github.com/agentic-wiki/wikiview/internal/store"
	"github.com/agentic-wiki/wikiview/internal/watch"
	"github.com/agentic-wiki/wikiview/ui"
)

func main() {
	// --root, matching the engine's flag, so the two tools are pointed at a
	// bundle the same way. Defaults to the working directory, which discovery
	// then walks up from.
	root := flag.String("root", ".", "bundle directory (walks up to find wiki.toml)")
	addr := flag.String("addr", "localhost:8080", "listen address")
	flag.Parse()

	if err := run(*root, *addr); err != nil {
		fmt.Fprintln(os.Stderr, "wikiview:", err)
		os.Exit(1)
	}
}

func run(root, addr string) error {
	s, err := store.Open(root)
	if err != nil {
		return err
	}
	srv := server.New(s, ui.Assets())
	idx := s.Snapshot()
	log.Printf("serving %s (%d entries) on http://%s", s.Dir, len(idx.Entries), addr)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// The bundle belongs to whoever else is editing it, so the index follows the
	// files rather than waiting to be asked. A rebuild that fails keeps the
	// previous index serving, so a half-saved entry is a logged warning rather
	// than an outage.
	go func() {
		err := watch.Watch(ctx, s.Dir, watch.DefaultQuiet, func() {
			changed, err := s.Rebuild()
			if err != nil {
				log.Printf("rebuild failed, serving the previous index: %v", err)
				return
			}
			if changed {
				srv.Notify(s.Version())
			}
		})
		if err != nil {
			log.Printf("watcher stopped, the index will no longer follow the files: %v", err)
		}
	}()

	httpSrv := &http.Server{Addr: addr, Handler: srv}
	errc := make(chan error, 1)
	go func() { errc <- httpSrv.ListenAndServe() }()

	select {
	case err := <-errc:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		// Cancelling ctx already closed every SSE stream, so Shutdown is not
		// waiting on connections that never end on their own.
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return httpSrv.Shutdown(shutdownCtx)
	}
}
