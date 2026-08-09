// Command wikiview serves an agentic-wiki bundle over HTTP.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/agentic-wiki/wikiview/internal/server"
	"github.com/agentic-wiki/wikiview/internal/store"
)

func main() {
	// --root, matching the engine's flag, so the two tools are pointed at a
	// bundle the same way. Defaults to the working directory, which discovery
	// then walks up from.
	root := flag.String("root", ".", "bundle directory (walks up to find wiki.toml)")
	addr := flag.String("addr", "localhost:8080", "listen address")
	flag.Parse()

	s, err := store.Open(*root)
	if err != nil {
		fmt.Fprintln(os.Stderr, "wikiview:", err)
		os.Exit(2)
	}
	idx := s.Snapshot()
	log.Printf("serving %s (%d entries) on http://%s", s.Dir, len(idx.Entries), *addr)

	if err := http.ListenAndServe(*addr, server.New(s)); err != nil {
		fmt.Fprintln(os.Stderr, "wikiview:", err)
		os.Exit(1)
	}
}
