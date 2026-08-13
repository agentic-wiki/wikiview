package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/agentic-wiki/wiki/bundle"
)

// A bundle whose wiki.toml carries things a rewrite would lose.
const handWritten = `spec = "0.1"
# The kind of thing a person writes and expects to still be there.

types = ["task", "note"]

[[tool.wikiview.board]]
id   = "backlog"
path = "/backlog"
`

func declared(t *testing.T, toml string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "wiki.toml"), []byte(toml), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

func read(t *testing.T, dir string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, "wiki.toml"))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// Appended, never rewritten: the file is the user's, holds comments and their
// own formatting, and none of that survives a parse-and-reserialize.
func TestDeclareAppends(t *testing.T) {
	dir := declared(t, handWritten)
	existing, _ := load(t, handWritten)

	if err := Declare(dir, existing, Board{ID: "bugs", Path: "/backlog", Name: "Bugs"}); err != nil {
		t.Fatal(err)
	}

	got := read(t, dir)
	if !strings.HasPrefix(got, handWritten) {
		t.Errorf("the file was not left intact ahead of the new table:\n%s", got)
	}
	if !strings.HasSuffix(got, "\n[[tool.wikiview.board]]\nid   = \"bugs\"\npath = \"/backlog\"\nname = \"Bugs\"\n") {
		t.Errorf("appended table = %q", got)
	}

	// And it parses, which is the only assertion that proves what it wrote is
	// what it meant.
	cfg, problems := loadDir(t, dir)
	if len(problems) != 0 {
		t.Errorf("problems = %v", problems)
	}
	if len(cfg.Board) != 2 || cfg.Board[1].ID != "bugs" || cfg.Board[1].Name != "Bugs" {
		t.Errorf("boards = %+v", cfg.Board)
	}
}

// Only the keys that say which board this is. `where`, `status` and `columns`
// all have defaults, and writing them out is a config file full of settings
// nobody chose.
func TestDeclareWritesOnlyWhatWasAskedFor(t *testing.T) {
	dir := declared(t, `spec = "0.1"`)
	if err := Declare(dir, Config{}, Board{ID: "notes", Path: "/notes"}); err != nil {
		t.Fatal(err)
	}
	got := read(t, dir)
	for _, absent := range []string{"where", "status", "columns", "lane", "name"} {
		if strings.Contains(got, absent) {
			t.Errorf("wrote %q, which nobody asked for:\n%s", absent, got)
		}
	}
	// A file with no trailing newline still gets a well-formed table after it.
	if !strings.Contains(got, "\n\n[[tool.wikiview.board]]\n") {
		t.Errorf("the table ran into the line above it:\n%q", got)
	}
}

func TestDeclareRefuses(t *testing.T) {
	existing, _ := load(t, handWritten)
	cases := []struct {
		why   string
		board Board
	}{
		{"a slash makes an id two segments, and the address splits at the first", Board{ID: "a/b", Path: "/backlog"}},
		{"an empty id has no address", Board{ID: "", Path: "/backlog"}},
		{"an id starting with a hyphen reads as a flag wherever it is pasted", Board{ID: "-x", Path: "/backlog"}},
		{"uppercase does not survive being read back out of a URL", Board{ID: "Bugs", Path: "/backlog"}},
		{"an id already declared would make one address mean two boards", Board{ID: "backlog", Path: "/backlog"}},
		{"a path that is not rooted is not a bundle path", Board{ID: "ok", Path: "backlog"}},
		{"a quote in a name would close the string early", Board{ID: "ok", Path: "/backlog", Name: "a\" \nb"}},
		{"a control character is a paste accident, not a name", Board{ID: "ok", Path: "/backlog", Name: "a\x00b"}},
	}
	for _, c := range cases {
		t.Run(c.why, func(t *testing.T) {
			dir := declared(t, handWritten)
			before := read(t, dir)
			if err := Declare(dir, existing, c.board); err == nil {
				t.Error("accepted it")
			}
			if read(t, dir) != before {
				t.Error("a refused board was written anyway")
			}
		})
	}
}

// A quote and a backslash are the two things a name can legitimately hold that
// TOML needs told about.
func TestDeclareEscapesWhatItAccepts(t *testing.T) {
	dir := declared(t, `spec = "0.1"`)
	name := `The "real" C:\ board`
	if err := Declare(dir, Config{}, Board{ID: "odd", Path: "/notes", Name: name}); err != nil {
		t.Fatal(err)
	}
	cfg, problems := loadDir(t, dir)
	if len(problems) != 0 {
		t.Errorf("problems = %v", problems)
	}
	if len(cfg.Board) != 1 || cfg.Board[0].Name != name {
		t.Errorf("name did not survive the round trip: %+v", cfg.Board)
	}
}

// The file's permissions are the user's, and a config write is not the place to
// quietly widen them. It also writes through a temp file and a rename, and a
// rename that lands beside its target instead of on top of it is a bug worth
// catching everywhere.
func TestDeclareKeepsPermissions(t *testing.T) {
	dir := declared(t, `spec = "0.1"`)
	path := filepath.Join(dir, "wiki.toml")
	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Declare(dir, Config{}, Board{ID: "notes", Path: "/notes"}); err != nil {
		t.Fatal(err)
	}
	// Windows has no mode bits to preserve. Go maps the whole of chmod onto the
	// read-only attribute there, so a file set to 0600 reads back as 0666 and
	// the assertion is about Go's mapping rather than about this package. The
	// rename below is the half that means something on every platform — and it
	// means more on Windows, where replacing an open file is a different
	// operation rather than the same one.
	if runtime.GOOS != "windows" {
		fi, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if got := fi.Mode().Perm(); got != 0o600 {
			t.Errorf("perm = %v, want 0600", got)
		}
	}
	// And nothing is left behind by the temp file the rename came from.
	names, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 1 {
		t.Errorf("directory holds %d files, want only wiki.toml", len(names))
	}
}

// loadDir decodes a bundle that is only a wiki.toml, for asserting on what
// Declare wrote rather than on how it reads alongside entries.
func loadDir(t *testing.T, dir string) (Config, []string) {
	t.Helper()
	b, err := bundle.Discover(dir)
	if err != nil {
		t.Fatal(err)
	}
	return Decode(b, nil)
}
