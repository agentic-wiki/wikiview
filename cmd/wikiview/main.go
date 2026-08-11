// Command wikiview serves an agentic-wiki bundle over HTTP.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/agentic-wiki/wikiview/internal/server"
	"github.com/agentic-wiki/wikiview/internal/store"
	"github.com/agentic-wiki/wikiview/internal/watch"
	"github.com/agentic-wiki/wikiview/ui"
)

// Version is set at build time via -ldflags "-X main.Version=...", the same way
// the engine does it, so a released binary can say which one it is. A package
// manager needs this: Homebrew's formula test runs the binary and checks the
// version it reports against the version it installed.
var Version = "dev"

func main() {
	// --root, matching the engine's flag, so the two tools are pointed at a
	// bundle the same way. Defaults to the working directory, which discovery
	// then walks up from.
	root := flag.String("root", ".", "bundle directory (walks up to find wiki.toml)")
	host := flag.String("host", "localhost", "interface to listen on (0.0.0.0 for all of them)")
	port := flag.Int("port", 8080, "port to listen on")
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()

	// Also accepted as a bare subcommand, matching `wiki version`.
	if *showVersion || (flag.NArg() > 0 && flag.Arg(0) == "version") {
		fmt.Println("wikiview", Version)
		return
	}

	// Reachable from this machine and reachable from the network are different
	// choices, and only one of them is the default. wikiview has no
	// authentication and writes to the bundle, so anyone who can reach it can
	// read every entry and tick boxes in them. Said once, where the choice is
	// made, rather than assumed to be understood.
	if !loopback(*host) {
		log.Printf("warning: %s accepts connections from the network, and wikiview has no authentication", *host)
	}

	// Joined here rather than carried as two values: JoinHostPort is what knows
	// that an IPv6 host needs brackets, and every layer below this wants one
	// address anyway.
	if err := run(*root, net.JoinHostPort(*host, strconv.Itoa(*port))); err != nil {
		fmt.Fprintln(os.Stderr, "wikiview:", err)
		os.Exit(1)
	}
}

// loopback reports whether a host is reachable only from this machine. An empty
// host is not: to a listener it means every interface.
func loopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func run(root, addr string) error {
	s, err := store.Open(root)
	if err != nil {
		return err
	}
	srv := server.New(s, ui.Assets())
	idx := s.View().Index
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
				srv.Notify(s.View().Version)
			}
		})
		if err != nil {
			log.Printf("watcher stopped, the index will no longer follow the files: %v", err)
		}
	}()

	httpSrv := &http.Server{
		Addr:    addr,
		Handler: srv,
		// A connection that opens and never sends headers would otherwise hold a
		// goroutine for as long as the process runs. Cheap to bound, and the only
		// unbounded resource left once streams release on shutdown.
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: it applies to the whole response, and an SSE response
		// is deliberately open for hours. Bounding that would disconnect every
		// idle reader on a timer.
		IdleTimeout: 2 * time.Minute,
	}
	errc := make(chan error, 1)
	go func() { errc <- httpSrv.ListenAndServe() }()

	select {
	case err := <-errc:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		// Streams first: Shutdown waits for handlers to return, and an SSE
		// handler is still running by design. Without ending them it waits out
		// the whole timeout every time.
		srv.Close()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return httpSrv.Shutdown(shutdownCtx)
	}
}
