package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/agentic-wiki/wikiview/internal/store"
)

// Written into a file nobody links to, so a test can prove by content that it
// was never served. A 404 that echoes a path is not a leak; this would be.
const neverServed = "SHOULD-NEVER-BE-SERVED"

// A bundle that links to a file it does not index, and also carries one nobody
// links to.
func newAssetServer(t *testing.T) (*Server, string) {
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
	write("wiki.toml", "spec = \"0.1\"\n")
	write("index.md", "---\nokf_version: \"0.1\"\n---\nsee [n](./notes/n.md)\n")
	write("notes/n.md", "---\ntype: note\n---\n"+
		"A [contract](./contract.sol) and ![a diagram](./diagram.png).\n"+
		"A [page](./page.html) and a [drawing](./drawing.svg).\n"+
		"A [script](./script.js), an [accented source](./accented.rs), a [blob](./blob.bin).\n"+
		"A [missing note](./gone.md) and one [above](../../outside.sol).\n")
	write("notes/contract.sol", "pragma solidity ^0.8.0;\n")
	write("notes/script.js", "alert('hi')\n")
	write("notes/accented.rs", "// café — a note about naïve résumés\nfn main() {}\n")
	write("notes/blob.bin", "\x00\x01\x02binary\x00")
	write("notes/diagram.png", "\x89PNG\r\n\x1a\nnot really")
	write("notes/page.html", "<script>alert(1)</script>")
	write("notes/drawing.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"><script/></svg>")
	// Nothing links to this one.
	write(".env", "SECRET="+neverServed+"\n")

	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return New(s, nil), dir
}

func rawGet(t *testing.T, srv *Server, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestRawServesALinkedFile(t *testing.T) {
	srv, _ := newAssetServer(t)

	rec := rawGet(t, srv, "/raw/notes/contract.sol")
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "pragma solidity") {
		t.Errorf("body=%q, want the file's contents", rec.Body.String())
	}

	// An image is fetched by the browser like any other image, so it has to
	// arrive as one.
	img := rawGet(t, srv, "/raw/notes/diagram.png")
	if img.Code != http.StatusOK {
		t.Fatalf("image code=%d, want 200", img.Code)
	}
	if got := img.Header().Get("Content-Type"); got != "image/png" {
		t.Errorf("image content-type=%q, want image/png", got)
	}
	if got := img.Header().Get("Content-Disposition"); got != "" {
		t.Errorf("an image should display, not download: %q", got)
	}
}

// The rule the whole server works by: a request path is a key before it is a
// path. A file nobody links to has no key, so it cannot be asked for — which is
// what stops this being a file server pointed at somebody's project.
//
// Asserted on content rather than status. A literal `..` is cleaned by Go's
// ServeMux and answered with a redirect before the handler runs, while a
// percent-encoded one arrives intact and misses the lookup; both are fine, and
// what actually matters is that no request ever comes back holding the file.
func TestRawServesOnlyWhatIsLinked(t *testing.T) {
	srv, dir := newAssetServer(t)

	for _, path := range []string{
		"/raw/.env",                     // present, and deliberately not linked
		"/raw/wiki.toml",                // the bundle's own config
		"/raw/notes/never-written.sol",  // linked by nothing, absent anyway
		"/raw/../../etc/passwd",         // a literal climb, which the router cleans
		"/raw/%2e%2e/%2e%2e/etc/passwd", // and one it does not
		"/raw/..%2f..%2fetc%2fpasswd",
		"/raw/notes", // a folder is not a file
		"/raw/",
	} {
		rec := rawGet(t, srv, path)
		if rec.Code == http.StatusOK {
			t.Errorf("GET %s returned 200: %s", path, rec.Body)
		}
		if strings.Contains(rec.Body.String(), neverServed) || strings.Contains(rec.Body.String(), "root:") {
			t.Errorf("GET %s served content it should not have", path)
		}
		if loc := rec.Header().Get("Location"); loc != "" && !strings.HasPrefix(loc, "/") {
			t.Errorf("GET %s redirected off-server: %s", path, loc)
		}
	}

	// The secret really is there to be found, so the misses above are the guard
	// working rather than the fixture being empty.
	if _, err := os.Stat(filepath.Join(dir, ".env")); err != nil {
		t.Fatalf("fixture: %v", err)
	}
	// …and a linked file still resolves, which is what proves the guard is not
	// simply refusing everything.
	if rec := rawGet(t, srv, "/raw/notes/contract.sol"); rec.Code != http.StatusOK {
		t.Errorf("a linked file should still be served, code=%d", rec.Code)
	}
}

// An entry's HTML is deliberately not rendered, so that writing a file in the
// bundle does not make you an author of the UI. Serving one from this origin as
// text/html would hand that straight back.
func TestRawWillNotServeHTMLInline(t *testing.T) {
	srv, _ := newAssetServer(t)

	rec := rawGet(t, srv, "/raw/notes/page.html")
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d, want it served as a download", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/octet-stream" {
		t.Errorf("content-type=%q, want application/octet-stream", ct)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, "attachment") {
		t.Errorf("content-disposition=%q, want an attachment", cd)
	}
}

// An SVG displays, because a diagram is the reason to have one. Script in it
// must not run: navigated to directly it would otherwise execute on this
// server's origin, where it could reach the API that writes to the bundle.
func TestRawSandboxesSVG(t *testing.T) {
	srv, _ := newAssetServer(t)

	rec := rawGet(t, srv, "/raw/notes/drawing.svg")
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/svg+xml" {
		t.Errorf("content-type=%q, want image/svg+xml so it renders", ct)
	}
	csp := rec.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "default-src 'none'") || !strings.Contains(csp, "sandbox") {
		t.Errorf("csp=%q, want scripts blocked and the document sandboxed", csp)
	}
}

// A declared content type only holds if the browser is told not to second-guess
// it from the bytes.
func TestRawNeverLetsTheBrowserSniff(t *testing.T) {
	srv, _ := newAssetServer(t)

	for _, path := range []string{
		"/raw/notes/page.html",
		"/raw/notes/drawing.svg",
		"/raw/notes/diagram.png",
		"/raw/notes/contract.sol",
		"/raw/notes/n.md",
	} {
		if got := rawGet(t, srv, path).Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Errorf("%s nosniff=%q", path, got)
		}
	}
}

// The entry API serves a parsed entry: the body with frontmatter stripped, and
// the frontmatter as data. The bytes on disk cannot be rebuilt from that, so
// this is the only way to get the file itself — which is what a backup or a
// diff wants.
func TestRawServesAnEntrysActualBytes(t *testing.T) {
	srv, _ := newAssetServer(t)

	rec := rawGet(t, srv, "/raw/notes/n.md")
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d, want 200", rec.Code)
	}
	body := rec.Body.String()
	if !strings.HasPrefix(body, "---\ntype: note\n---\n") {
		t.Errorf("body=%q, want the frontmatter the entry API strips", body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/markdown") {
		t.Errorf("content-type=%q, want text/markdown", ct)
	}
}

// A key is inside the bundle by construction; a symlink sitting at that key is
// not bound by that, and following one serves a file the bundle only points at.
func TestRawDoesNotFollowASymlinkOutOfTheBundle(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need a privilege there that CI does not grant")
	}
	srv, dir := newAssetServer(t)

	outside := filepath.Join(t.TempDir(), "outside.sol")
	if err := os.WriteFile(outside, []byte("SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Replace the linked file with a link pointing out of the bundle, so the key
	// still resolves and only the target has moved.
	linked := filepath.Join(dir, "notes", "contract.sol")
	if err := os.Remove(linked); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, linked); err != nil {
		t.Fatal(err)
	}

	if rec := rawGet(t, srv, "/raw/notes/contract.sol"); rec.Code != http.StatusNotFound {
		t.Errorf("code=%d body=%q, want 404", rec.Code, rec.Body.String())
	}
}

// The reader needs to tell three cases apart that all mean "not an entry": a
// file it can fetch, knowledge not yet written, and something out of reach.
func TestEntryReportsWhereToFetchANonEntry(t *testing.T) {
	srv, _ := newAssetServer(t)

	var got EntryView
	if code := get(t, srv, "/api/entry/notes/n.md", &got); code != http.StatusOK {
		t.Fatalf("code=%d", code)
	}
	byRaw := map[string]LinkView{}
	for _, l := range got.Links {
		byRaw[l.Raw] = l
	}

	if a := byRaw["./contract.sol"].Asset; a != "/raw/notes/contract.sol" {
		t.Errorf("contract asset=%q, want the URL to fetch it at", a)
	}
	if a := byRaw["./diagram.png"].Asset; a != "/raw/notes/diagram.png" {
		t.Errorf("image asset=%q, want the URL to fetch it at", a)
	}
	// A `.md` that does not exist is knowledge not yet written. Offering it as a
	// file to download would be answering a different question.
	if a := byRaw["./gone.md"].Asset; a != "" {
		t.Errorf("missing entry asset=%q, want none", a)
	}
	// And one above the bundle root stays what it was: not fetchable at all.
	above := byRaw["../../outside.sol"]
	if !above.Outside || above.Asset != "" {
		t.Errorf("outside link = %+v, want outside with no asset", above)
	}
}

// A source file is readable, and there is no list of every extension someone
// might keep beside their notes. Downloading a `.sol` to look at three lines of
// it is the wrong answer, so the bytes decide.
func TestRawDisplaysAnythingThatReadsAsText(t *testing.T) {
	srv, _ := newAssetServer(t)

	for _, path := range []string{
		"/raw/notes/contract.sol",
		"/raw/notes/script.js",
		"/raw/notes/accented.rs", // multi-byte characters are still text
	} {
		rec := rawGet(t, srv, path)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d", path, rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
			t.Errorf("%s content-type=%q, want text/plain", path, ct)
		}
		if cd := rec.Header().Get("Content-Disposition"); cd != "" {
			t.Errorf("%s should display rather than download, got %q", path, cd)
		}
	}

	// A `.js` served as text/plain is source to read. nosniff is what stops the
	// browser deciding otherwise.
	if got := rawGet(t, srv, "/raw/notes/script.js").Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("script nosniff=%q", got)
	}
}

// Bytes decide for unknown extensions, but not for markup a browser executes,
// and not for something that is plainly not text.
func TestRawStillDownloadsBinariesAndMarkup(t *testing.T) {
	srv, _ := newAssetServer(t)

	for _, path := range []string{
		"/raw/notes/blob.bin",  // NUL bytes: binary whatever it is called
		"/raw/notes/page.html", // valid UTF-8, and exactly what must not render
	} {
		rec := rawGet(t, srv, path)
		if ct := rec.Header().Get("Content-Type"); ct != "application/octet-stream" {
			t.Errorf("%s content-type=%q, want application/octet-stream", path, ct)
		}
		if cd := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, "attachment") {
			t.Errorf("%s content-disposition=%q, want an attachment", path, cd)
		}
	}
}

// The 512-byte window can land mid-character, which is not a reason to call a
// file binary.
func TestIsTextHandlesAMultiByteRuneOnTheBoundary(t *testing.T) {
	dir := t.TempDir()
	// Pad so that a three-byte rune straddles byte 512.
	body := strings.Repeat("a", 511) + "日本語" + strings.Repeat("b", 40)
	p := filepath.Join(dir, "wide.txt")
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(p)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	if !isText(f) {
		t.Error("a file split mid-rune at the window edge was called binary")
	}
	// And it left the file where it found it, or the response would be truncated.
	var first [1]byte
	if _, err := f.Read(first[:]); err != nil || first[0] != 'a' {
		t.Errorf("file not rewound: read %q, err %v", first, err)
	}
}
