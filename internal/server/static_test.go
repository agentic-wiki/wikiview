package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

// A built UI, in the two files that matter: the page that names the bundle, and
// a hashed asset it names.
func withUI(t *testing.T) *Server {
	t.Helper()
	srv := newTestServer(t)
	srv.ui = fstest.MapFS{
		"index.html":             {Data: []byte(`<!doctype html><script src="/assets/index-abc123.js"></script>`)},
		"assets/index-abc123.js": {Data: []byte("console.log(1)")},
	}
	return srv
}

// The bug this pins cost an afternoon of "I recompiled and nothing changed":
// index.html names the hashed bundle, so a cached copy of it keeps asking for the
// previous build's JavaScript no matter how many times the binary is rebuilt. The
// fallback path said so and set the header; the branch that serves `/` as a file
// did not, and `/` is how everybody opens the app.
func TestIndexIsNeverCached(t *testing.T) {
	srv := withUI(t)

	// `/` is served as a file; a client route is served as the fallback. Two
	// branches, one rule. (`/index.html` is not in the list because net/http
	// redirects it to `/` before any of this runs.)
	for _, path := range []string{"/", "/kanban/backlog/backlog/index.md"} {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d", path, rec.Code)
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-cache" {
			t.Errorf("GET %s: Cache-Control = %q, want no-cache", path, got)
		}
	}
}

// The other half of the same rule: a hashed name changes with its content, so it
// can be cached forever. Without this the app refetches its whole bundle on every
// navigation that reloads the page.
func TestHashedAssetsAreCachedHard(t *testing.T) {
	srv := withUI(t)

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/assets/index-abc123.js", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET asset = %d", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Errorf("Cache-Control = %q, want the immutable one", got)
	}
}

// A binary built without the frontend answers the API and says what to do about
// the page, rather than serving a blank 404.
func TestNoUIBuiltSaysSo(t *testing.T) {
	srv := newTestServer(t)
	srv.ui = nil

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET / = %d, want 404", rec.Code)
	}
	if body := rec.Body.String(); !contains(body, "just build") {
		t.Errorf("body = %q, want it to name the command that fixes this", body)
	}
}
