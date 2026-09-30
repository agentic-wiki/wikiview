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

// The id scopes what a browser remembers, so it has to be the same on every
// request for one bundle and different for another — including one reached by a
// relative path, since that is how the server is usually started.
func TestBundleIDIsStablePerLocation(t *testing.T) {
	a, b := t.TempDir(), t.TempDir()
	first, again := bundleID(a), bundleID(a)
	if first != again {
		t.Errorf("the same directory produced two ids: %q then %q", first, again)
	}
	if bundleID(a) == bundleID(b) {
		t.Error("two directories share an id: preferences would leak between them")
	}
	if bundleID(".") != bundleID(mustAbs(t, ".")) {
		t.Error("a relative root produced a different id than its absolute form")
	}
	if id := bundleID(a); len(id) != 12 {
		t.Errorf("id=%q, want 12 hex characters", id)
	}
}

func mustAbs(t *testing.T, p string) string {
	t.Helper()
	abs, err := filepath.Abs(p)
	if err != nil {
		t.Fatal(err)
	}
	return abs
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

// bundleServer serves a bundle made of exactly these files, and returns the
// folder so a test can change it afterwards.
func bundleServer(t *testing.T, files map[string]string) (*Server, func(name, content string)) {
	t.Helper()
	dir := t.TempDir()
	write := func(name, content string) {
		t.Helper()
		p := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for name, content := range files {
		write(name, content)
	}
	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return New(s, nil), write
}

// Tag colour is a tag's position in this list, so the order is the contract:
// first appearance, walking entries by path, each entry's tags as written. The
// fixture is a map, so the files are written in no particular order, and a walk
// that followed the filesystem or the index instead of the paths shows up here.
func TestBundleTagsInFirstAppearanceOrder(t *testing.T) {
	srv, write := bundleServer(t, map[string]string{
		"wiki.toml":   "spec = \"0.1\"\n",
		"index.md":    "---\nokf_version: \"0.1\"\n---\nhome\n",
		"z/last.md":   "---\ntags: [zeta, alpha]\n---\n",
		"b.md":        "---\ntags: [beta, alpha]\n---\n",
		"a.md":        "---\ntags: [gamma, beta]\n---\n",
		"untagged.md": "---\ntype: note\n---\n",
	})
	var got BundleInfo
	get(t, srv, "/api/bundle", &got)
	// a.md, then b.md, then z/last.md; each tag once, where it first appeared.
	assertSame(t, "tags", got.Tags, []string{"gamma", "beta", "alpha", "zeta"})

	// The list follows the files: a new tag in an early path takes its place in
	// the order, which shifts the ones after it. Accepted, and pinned so it is a
	// decision rather than a surprise.
	write("0.md", "---\ntags: [new]\n---\n")
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/refresh", strings.NewReader("{}")))
	if rec.Code != http.StatusOK {
		t.Fatalf("refresh: %d %s", rec.Code, rec.Body)
	}
	get(t, srv, "/api/bundle", &got)
	assertSame(t, "tags after a new file", got.Tags, []string{"new", "gamma", "beta", "alpha", "zeta"})
}

// A bundle with no tags sends an empty list, not null: a client indexing into a
// list it was promised has no reason to check for one.
func TestBundleTagsAreAListWhenThereAreNone(t *testing.T) {
	srv, _ := bundleServer(t, map[string]string{
		"wiki.toml": "spec = \"0.1\"\n",
		"index.md":  "---\nokf_version: \"0.1\"\n---\nhome\n",
	})
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/bundle", nil))
	if !strings.Contains(rec.Body.String(), `"tags":[]`) {
		t.Errorf("body %s: want an empty tags list", rec.Body)
	}
}
