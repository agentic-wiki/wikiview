package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/agentic-wiki/wikiview/internal/store"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	dir := t.TempDir()
	write := func(name, content string) {
		p := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("wiki.toml", "spec = \"0.1\"\n\n[tool.wikiview]\ndefault_board = \"/\"\n")
	write("index.md", "---\nokf_version: \"0.1\"\n---\nhome [a](./notes/a.md)\n")
	// Its title deliberately says something its filename does not, so the two
	// names an entry can have stay distinguishable in every assertion below.
	write("notes/a.md", "---\ntype: note\ntitle: The first note\ntags: [ui, api]\n---\n"+
		"# Heading\n\nSee [b](./b.md) and [gone](./missing.md).\n\n- [ ] open\n- [x] done\n")
	write("notes/b.md", "---\ntype: note\n---\nb\n")

	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return New(s, nil)
}

func get(t *testing.T, srv *Server, path string, into any) int {
	t.Helper()
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	if into != nil && rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), into); err != nil {
			t.Fatalf("GET %s: %v (body %q)", path, err, rec.Body)
		}
	}
	return rec.Code
}

func TestBundleEndpoint(t *testing.T) {
	var got BundleInfo
	if code := get(t, newTestServer(t), "/api/bundle", &got); code != http.StatusOK {
		t.Fatalf("code=%d", code)
	}
	if got.Spec != "0.1" || got.Entries != 3 {
		t.Errorf("got %+v, want spec 0.1 and 3 entries", got)
	}
	// The [tool.*] tables are reported so a client knows what config exists,
	// without wiki having interpreted any of it.
	if len(got.Tools) != 1 || got.Tools[0] != "wikiview" {
		t.Errorf("tools=%v, want [wikiview]", got.Tools)
	}
}

// The guard is structural: a request path is a map key, so traversal is not
// blocked, it is meaningless — there is simply no such key. The property under
// test is that nothing outside the bundle is ever served, whatever the route
// layer decides to do with the path first.
//
// Two mechanisms cover it and only the second is ours. Go's ServeMux cleans a
// path before routing, so a literal `..` or `//` is answered with a redirect and
// never reaches the handler. Percent-encoded traversal is *not* cleaned —
// PathValue decodes after matching — so `%2e%2e%2f` arrives at the handler
// intact, and is harmless for the only reason that matters: it is looked up in
// the index and misses. That is the case worth having a test for.
func TestPathIsOnlyEverAMapKey(t *testing.T) {
	// A real file outside the bundle, to prove by content rather than by status
	// code that nothing escaped. An echoed path in a 404 is not a leak; this is.
	outside := filepath.Join(t.TempDir(), "secret.txt")
	const secret = "SHOULD-NEVER-BE-SERVED"
	if err := os.WriteFile(outside, []byte(secret), 0o644); err != nil {
		t.Fatal(err)
	}

	srv := newTestServer(t)
	for _, p := range []string{
		"/api/entry/../../../etc/passwd",
		"/api/entry/notes/../../etc/passwd",
		"/api/entry//etc/passwd",
		"/api/entry/etc/passwd",
		"/api/entry/%2e%2e%2f%2e%2e%2fetc%2fpasswd", // reaches the handler undecoded-by-mux
		"/api/entry/..%2f..%2f" + strings.TrimPrefix(outside, "/"),
		"/api/entry" + outside,
		"/api/entry/",
		"/api/entry/notes",   // a folder, not an entry
		"/api/entry/a.md",    // a bare name must not be guessed at
		"/api/entry/notes/a", // no extension
	} {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
		if rec.Code == http.StatusOK {
			t.Errorf("GET %s returned 200: %s", p, rec.Body)
		}
		if strings.Contains(rec.Body.String(), secret) || strings.Contains(rec.Body.String(), "root:") {
			t.Errorf("GET %s served content from outside the bundle", p)
		}
		if loc := rec.Header().Get("Location"); loc != "" && !strings.HasPrefix(loc, "/") {
			t.Errorf("GET %s redirected off-server: %s", p, loc)
		}
	}
	// The real entry still resolves, which is what proves the guard is not just
	// refusing everything.
	if code := get(t, srv, "/api/entry/notes/a.md", nil); code != http.StatusOK {
		t.Errorf("the real entry should still resolve, code=%d", code)
	}
}

func TestUnknownRoutes(t *testing.T) {
	srv := newTestServer(t)
	for _, p := range []string{"/api/nope", "/api/", "/api/bundle/extra"} {
		if code := get(t, srv, p, nil); code == http.StatusOK {
			t.Errorf("GET %s should not succeed", p)
		}
	}
}
