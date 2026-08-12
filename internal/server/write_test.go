package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/agentic-wiki/wikiview/internal/config"
)

func put(t *testing.T, srv *Server, path string, body any) (int, uint64) {
	t.Helper()
	return send(t, srv, http.MethodPut, path, body)
}

func post(t *testing.T, srv *Server, path string, body any) (int, uint64) {
	t.Helper()
	return send(t, srv, http.MethodPost, path, body)
}

func send(t *testing.T, srv *Server, method, path string, body any) (int, uint64) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(method, path, bytes.NewReader(raw)))
	// Both an accepted write and a refused one carry a version, which is what
	// lets a client resync from either in one step.
	var out struct {
		Version uint64 `json:"version"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out.Version
}

// raw reads an entry off disk, so an assertion is about the file rather than
// about what the API said it did.
func raw(t *testing.T, srv *Server, entry string) string {
	t.Helper()
	p := filepath.Join(srv.store.View().Index.Bundle.Dir, filepath.FromSlash(entry))
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func versionOf(t *testing.T, srv *Server) uint64 {
	t.Helper()
	var info BundleInfo
	if code := get(t, srv, "/api/bundle", &info); code != http.StatusOK {
		t.Fatalf("GET /api/bundle = %d", code)
	}
	return info.Version
}

func TestMoveCardWritesTheBoardsStatusField(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	at := versionOf(t, srv)

	code, after := put(t, srv, "/api/card/backlog/backlog/a.md", cardRequest{Value: "in-progress", Version: at})
	if code != http.StatusOK {
		t.Fatalf("PUT = %d, want 200", code)
	}
	if after == at {
		t.Errorf("version did not move: %d", after)
	}

	// The file, not the response: the write is the point.
	if got := raw(t, srv, "backlog/a.md"); !strings.Contains(got, "status: in-progress") {
		t.Errorf("a.md = %q", got)
	}
	// And the board agrees on the next read, so nothing is left claiming the old
	// column.
	b := board(t, srv, "/api/board/backlog")
	for _, c := range b.Columns {
		in := slices.Contains(cardPaths(c), "/backlog/a.md")
		if in != (c.Value == "in-progress") {
			t.Errorf("column %q has a.md = %v", c.Value, in)
		}
	}
}

// The board names the field, so a board over a folder that calls it something
// else writes that instead — and leaves `status` where it was.
func TestMoveCardWritesWhateverTheBoardCallsStatus(t *testing.T) {
	srv := newBoardServer(t, `spec = "0.1"

[[tool.wikiview.board]]
id     = "backlog"
path   = "/backlog"
status = "stage"
`)
	code, _ := put(t, srv, "/api/card/backlog/backlog/a.md", cardRequest{Value: "shipped", Version: versionOf(t, srv)})
	if code != http.StatusOK {
		t.Fatalf("PUT = %d, want 200", code)
	}
	got := raw(t, srv, "backlog/a.md")
	if !strings.Contains(got, "stage: shipped") {
		t.Errorf("stage not written: %q", got)
	}
	if !strings.Contains(got, "status: todo") {
		t.Errorf("status was disturbed: %q", got)
	}
}

// A board read before somebody else's edit must not write over it. The version
// is the whole guard, so a refused move has to leave the file alone.
func TestMoveCardRefusesAStaleBoard(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	stale := versionOf(t, srv)

	// Somebody else's write moves the version on.
	if code, _ := put(t, srv, "/api/card/backlog/backlog/b.md", cardRequest{Value: "todo", Version: stale}); code != http.StatusOK {
		t.Fatalf("setup PUT = %d", code)
	}
	current := versionOf(t, srv)

	code, reported := put(t, srv, "/api/card/backlog/backlog/a.md", cardRequest{Value: "done", Version: stale})
	if code != http.StatusConflict {
		t.Fatalf("PUT = %d, want 409", code)
	}
	if reported != current {
		t.Errorf("conflict reported version %d, want %d", reported, current)
	}
	if got := raw(t, srv, "backlog/a.md"); !strings.Contains(got, "status: todo") {
		t.Errorf("a refused move wrote anyway: %q", got)
	}
}

// The column for entries with no status takes no drops: emptying the field is a
// different operation, and doing it silently here would lose the value.
func TestMoveCardRefusesNoStatus(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	code, _ := put(t, srv, "/api/card/backlog/backlog/a.md", cardRequest{Value: "", Version: versionOf(t, srv)})
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("PUT = %d, want 422", code)
	}
	if got := raw(t, srv, "backlog/a.md"); !strings.Contains(got, "status: todo") {
		t.Errorf("a.md = %q", got)
	}
}

// A board says which field to write, so it may only write the entries it holds.
// Otherwise the board id is a lever for setting `status` on anything in the
// bundle.
func TestMoveCardRefusesAnEntryOffTheBoard(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	at := versionOf(t, srv)

	for _, path := range []string{
		"/api/card/backlog/index.md",        // outside the board's folder
		"/api/card/backlog/backlog/note.md", // inside it, but filtered out by `where`
		"/api/card/backlog/backlog/gone.md", // no such entry
	} {
		if code, _ := put(t, srv, path, cardRequest{Value: "done", Version: at}); code != http.StatusNotFound {
			t.Errorf("PUT %s = %d, want 404", path, code)
		}
	}
	if got := raw(t, srv, "backlog/note.md"); !strings.Contains(got, "status: todo") {
		t.Errorf("note.md = %q", got)
	}
	if versionOf(t, srv) != at {
		t.Error("a refused move rebuilt the index")
	}
}

func TestMoveCardRefusesAnUnknownBoard(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	code, _ := put(t, srv, "/api/card/nope/backlog/a.md", cardRequest{Value: "done", Version: versionOf(t, srv)})
	if code != http.StatusNotFound {
		t.Fatalf("PUT = %d, want 404", code)
	}
}

// `root` is a board like any other, so a bundle with no config can still move a
// card.
func TestMoveCardOnTheRootBoard(t *testing.T) {
	srv := newBoardServer(t, `spec = "0.1"`)
	code, _ := put(t, srv, "/api/card/root/backlog/a.md", cardRequest{Value: "done", Version: versionOf(t, srv)})
	if code != http.StatusOK {
		t.Fatalf("PUT = %d, want 200", code)
	}
	if got := raw(t, srv, "backlog/a.md"); !strings.Contains(got, "status: done") {
		t.Errorf("a.md = %q", got)
	}
}

// The checkbox write, which had no test of its own: the UI suite covered the
// client half and this half was taken on trust.
func TestToggleCheckbox(t *testing.T) {
	srv := newTestServer(t)
	at := versionOf(t, srv)

	// Line 10 of notes/a.md, counted from the top of the *file*. Counting within
	// the body puts the same checkbox at 5, which is the mistake the two
	// coordinate systems exist to make impossible.
	code, after := put(t, srv, "/api/checkbox/notes/a.md", checkboxRequest{Line: 10, Done: true, Version: at})
	if code != http.StatusOK {
		t.Fatalf("PUT = %d, want 200", code)
	}
	if after == at {
		t.Errorf("version did not move: %d", after)
	}
	if got := raw(t, srv, "notes/a.md"); !strings.Contains(got, "- [x] open") {
		t.Errorf("a.md = %q", got)
	}
}

// The version is the whole guard: a line only means something against the
// content it was read from, so a refused toggle must leave the file alone.
func TestToggleCheckboxRefusesAStaleEntry(t *testing.T) {
	srv := newTestServer(t)
	stale := versionOf(t, srv)
	if code, _ := put(t, srv, "/api/checkbox/notes/a.md", checkboxRequest{Line: 10, Done: true, Version: stale}); code != http.StatusOK {
		t.Fatalf("setup PUT = %d", code)
	}
	current := versionOf(t, srv)

	code, reported := put(t, srv, "/api/checkbox/notes/a.md", checkboxRequest{Line: 10, Done: false, Version: stale})
	if code != http.StatusConflict {
		t.Fatalf("PUT = %d, want 409", code)
	}
	if reported != current {
		t.Errorf("conflict reported version %d, want %d", reported, current)
	}
	if got := raw(t, srv, "notes/a.md"); !strings.Contains(got, "- [x] open") {
		t.Errorf("a refused toggle wrote anyway: %q", got)
	}
}

// A line that is not a checkbox, and an entry that does not exist. The engine
// owns the first answer; this only has to pass it on rather than write anyway.
func TestToggleCheckboxRefusesWhatIsNotOne(t *testing.T) {
	srv := newTestServer(t)
	at := versionOf(t, srv)

	if code, _ := put(t, srv, "/api/checkbox/notes/a.md", checkboxRequest{Line: 1, Done: true, Version: at}); code != http.StatusUnprocessableEntity {
		t.Errorf("a line that is not a checkbox = %d, want 422", code)
	}
	if code, _ := put(t, srv, "/api/checkbox/notes/gone.md", checkboxRequest{Line: 1, Done: true, Version: at}); code != http.StatusNotFound {
		t.Errorf("an entry that does not exist = %d, want 404", code)
	}
	if versionOf(t, srv) != at {
		t.Error("a refused toggle rebuilt the index")
	}
}

func TestDeclareBoardAppendsToWikiToml(t *testing.T) {
	srv := newBoardServer(t, `spec = "0.1"
# A comment the user wrote, and their own spacing.

types = ["task", "note"]
`)
	at := versionOf(t, srv)

	code, after := post(t, srv, "/api/board", declareRequest{ID: "bugs", Path: "/backlog", Name: "Bugs"})
	if code != http.StatusOK {
		t.Fatalf("POST = %d, want 200", code)
	}
	// The config is part of what the server answers with, so declaring a board
	// has to reach the clients watching rather than only whoever reloads next.
	if after == at {
		t.Errorf("version did not move: %d", after)
	}

	got := raw(t, srv, "wiki.toml")
	// Appended, so everything the user wrote is still there — comments and all.
	if !strings.Contains(got, "# A comment the user wrote") || !strings.Contains(got, `types = ["task", "note"]`) {
		t.Errorf("the file was rewritten rather than appended to: %q", got)
	}
	for _, want := range []string{"[[tool.wikiview.board]]", `id   = "bugs"`, `path = "/backlog"`, `name = "Bugs"`} {
		if !strings.Contains(got, want) {
			t.Errorf("wiki.toml is missing %q: %q", want, got)
		}
	}

	// And it is a board, which is the only assertion that proves the file it
	// wrote parses as the one it meant.
	b := board(t, srv, "/api/board/bugs")
	if b.Name != "Bugs" || b.Path != "/backlog" {
		t.Errorf("board = %+v", b)
	}
	if len(b.Columns) == 0 {
		t.Error("the declared board has no columns")
	}
}

// Two boards over one folder is the thing an id exists to allow, so declaring
// the second must not need anything the first did not.
func TestDeclareBoardOverAFolderThatAlreadyHasOne(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	if code, _ := post(t, srv, "/api/board", declareRequest{ID: "bugs", Path: "/backlog"}); code != http.StatusOK {
		t.Fatalf("POST = %d, want 200", code)
	}
	if b := board(t, srv, "/api/board/bugs"); b.Path != "/backlog" {
		t.Errorf("board = %+v", b)
	}
	// The first one is untouched, which appending is supposed to guarantee.
	if b := board(t, srv, "/api/board/backlog"); len(b.Columns) == 0 {
		t.Error("the board that was already declared lost its columns")
	}
}

func TestDeclareBoardRefusesWhatCannotBeAddressed(t *testing.T) {
	cases := []struct {
		why string
		req declareRequest
	}{
		{"an id with a slash is two segments, and the address splits at the first", declareRequest{ID: "a/b", Path: "/backlog"}},
		{"an empty id has no address at all", declareRequest{ID: "", Path: "/backlog"}},
		{"an id that is already declared would make one address mean two boards", declareRequest{ID: "backlog", Path: "/backlog"}},
		{"a folder with nothing in it boards as an empty page", declareRequest{ID: "empty", Path: "/nowhere"}},
		{"nor is a folder holding no tasks worth a board", declareRequest{ID: "notes", Path: "/notes"}},
		{"a name with a newline in it would write a broken file", declareRequest{ID: "ok", Path: "/backlog", Name: "one\ntwo"}},
	}
	for _, c := range cases {
		t.Run(c.why, func(t *testing.T) {
			srv := newBoardServer(t, declaredBoard)
			before := raw(t, srv, "wiki.toml")

			if code, _ := post(t, srv, "/api/board", c.req); code != http.StatusUnprocessableEntity {
				t.Errorf("POST = %d, want 422", code)
			}
			if raw(t, srv, "wiki.toml") != before {
				t.Error("a refused declaration wrote to wiki.toml anyway")
			}
		})
	}
}

func TestBoardSettingsAreWritten(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	at := versionOf(t, srv)

	if code, _ := post(t, srv, "/api/board", declareRequest{ID: "bugs", Path: "/backlog"}); code != http.StatusOK {
		t.Fatalf("setup POST = %d", code)
	}
	code, after := put(t, srv, "/api/board/bugs", config.Settings{
		Name:    "Bugs",
		Status:  "status",
		Lane:    "priority",
		Where:   []string{"type=task", "priority=high"},
		Columns: []string{"todo", "in-progress"},
	})
	if code != http.StatusOK {
		t.Fatalf("PUT = %d, want 200", code)
	}
	if after == at {
		t.Errorf("version did not move: %d", after)
	}

	b := board(t, srv, "/api/board/bugs")
	if b.Name != "Bugs" || b.Lane != "priority" {
		t.Errorf("board = %+v", b)
	}
	// The filter took, so only the high-priority task is a card.
	var cards []string
	for _, c := range b.Columns {
		cards = append(cards, cardPaths(c)...)
	}
	if len(cards) != 1 || cards[0] != "/backlog/a.md" {
		t.Errorf("cards = %v", cards)
	}
	// The declared columns come first and say they are pinned; the ones that only
	// exist because an entry has them do not.
	if len(b.Columns) < 2 || !b.Columns[0].Pinned || !b.Columns[1].Pinned {
		t.Errorf("columns = %+v", b.Columns)
	}
	if b.Columns[0].Value != "todo" || b.Columns[1].Value != "in-progress" {
		t.Errorf("column order = %+v", b.Columns)
	}
}

// A board with no columns declared has no pinned ones, which is the distinction
// the UI shows.
func TestInferredColumnsAreNotPinned(t *testing.T) {
	srv := newBoardServer(t, `spec = "0.1"

[[tool.wikiview.board]]
id   = "backlog"
path = "/backlog"
`)
	for _, c := range board(t, srv, "/api/board/backlog").Columns {
		if c.Pinned {
			t.Errorf("column %q claims to be pinned", c.Value)
		}
	}
}

// `root` exists without any config, so its settings have to be writable — which
// means declaring it. Configuring the board somebody is looking at cannot be a
// dead end.
func TestRootBoardSettingsDeclareIt(t *testing.T) {
	srv := newBoardServer(t, `spec = "0.1"`)
	if code, _ := put(t, srv, "/api/board/root", config.Settings{Lane: "priority"}); code != http.StatusOK {
		t.Fatalf("PUT = %d, want 200", code)
	}
	if got := raw(t, srv, "wiki.toml"); !strings.Contains(got, `id   = "root"`) {
		t.Errorf("wiki.toml = %q", got)
	}
	if b := board(t, srv, "/api/board/root"); b.Lane != "priority" || !b.Declared {
		t.Errorf("board = %+v", b)
	}
}

func TestBoardSettingsRefuseWhatCannotBeMeant(t *testing.T) {
	cases := []struct {
		why      string
		id       string
		settings config.Settings
		want     int
	}{
		{"a board nobody declared has no table to write to", "nope", config.Settings{Lane: "x"}, http.StatusNotFound},
		{"a filter that does not parse would be written and then reported forever",
			"backlog", config.Settings{Where: []string{"nonsense"}}, http.StatusUnprocessableEntity},
		{"a newline in a column name would write a broken file",
			"backlog", config.Settings{Columns: []string{"a\nb"}}, http.StatusUnprocessableEntity},
	}
	for _, c := range cases {
		t.Run(c.why, func(t *testing.T) {
			srv := newBoardServer(t, declaredBoard)
			before := raw(t, srv, "wiki.toml")
			if code, _ := put(t, srv, "/api/board/"+c.id, c.settings); code != c.want {
				t.Errorf("PUT = %d, want %d", code, c.want)
			}
			if raw(t, srv, "wiki.toml") != before {
				t.Error("a refused update wrote to wiki.toml anyway")
			}
		})
	}
}

// A column or a lane is one value, and a list has many. Written anyway it
// renders as every card in one nameless group, which reads as a broken board
// rather than a setting that cannot mean anything.
func TestBoardSettingsRefuseAListAsAGrouping(t *testing.T) {
	for _, s := range []config.Settings{{Status: "tags"}, {Lane: "tags"}} {
		srv := newBoardServer(t, declaredBoard)
		dir := srv.store.View().Index.Bundle.Dir
		if err := os.WriteFile(filepath.Join(dir, "backlog", "a.md"),
			[]byte("---\ntype: task\nstatus: todo\ntags: [ui, api]\n---\nA\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := srv.store.Rebuild(); err != nil {
			t.Fatal(err)
		}
		before := raw(t, srv, "wiki.toml")

		if code, _ := put(t, srv, "/api/board/backlog", s); code != http.StatusUnprocessableEntity {
			t.Errorf("PUT %+v = %d, want 422", s, code)
		}
		if raw(t, srv, "wiki.toml") != before {
			t.Error("a refused update wrote to wiki.toml anyway")
		}
	}
}
