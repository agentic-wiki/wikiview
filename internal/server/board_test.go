package server

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/agentic-wiki/wikiview/internal/store"
)

// A bundle with a declared board over /backlog, holding entries whose statuses
// deliberately overrun what the config declares.
func newBoardServer(t *testing.T, toml string) *Server {
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
	write("wiki.toml", toml)
	write("index.md", "---\nokf_version: \"0.1\"\n---\nhome\n")
	write("backlog/a.md", "---\ntype: task\nstatus: todo\npriority: high\n---\nA\n")
	write("backlog/b.md", "---\ntype: task\nstatus: done\npriority: low\n---\nB\n")
	// A status nobody declared, and an entry with no status at all.
	write("backlog/c.md", "---\ntype: task\nstatus: blocked\n---\nC\n")
	write("backlog/d.md", "---\ntype: task\n---\nD\n")
	// Not a task: the default `where` should leave it out.
	write("backlog/note.md", "---\ntype: note\nstatus: todo\n---\nA note\n")
	// A folder holding no tasks at all, so "a board over this would be empty" is
	// a case with a fixture rather than a claim.
	write("notes/n.md", "---\ntype: note\n---\nJust a note\n")

	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return New(s, nil)
}

const declaredBoard = `spec = "0.1"

[[tool.wikiview.board]]
id      = "backlog"
path    = "/backlog"
columns = ["todo", "in-progress", "done"]
lane    = "priority"
`

func board(t *testing.T, srv *Server, path string) BoardView {
	t.Helper()
	var got BoardView
	if code := get(t, srv, path, &got); code != http.StatusOK {
		t.Fatalf("GET %s = %d", path, code)
	}
	return got
}

func columnValues(b BoardView) []string {
	out := make([]string, 0, len(b.Columns))
	for _, c := range b.Columns {
		out = append(out, c.Value)
	}
	return out
}

func cardPaths(c Column) []string {
	out := make([]string, 0, len(c.Cards))
	for _, card := range c.Cards {
		out = append(out, card.Path)
	}
	return out
}

// Config orders and adds; it never filters. A status present in the entries but
// missing from `columns` still gets a column, or a card would vanish from the
// board while sitting in the folder — which reads as data loss.
func TestDeclaredColumnsOrderAndUndeclaredOnesFollow(t *testing.T) {
	b := board(t, newBoardServer(t, declaredBoard), "/api/board/backlog")

	// Declared order first, empties included: declaring "in-progress" before
	// anything is in it is precisely what inference cannot do. Then the status
	// the entries turned out to have, then the cards with none.
	want := []string{"todo", "in-progress", "done", "blocked", ""}
	if got := columnValues(b); len(got) != len(want) {
		t.Fatalf("columns=%v, want %v", got, want)
	} else {
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("columns=%v, want %v", got, want)
			}
		}
	}
	if len(b.Columns[1].Cards) != 0 {
		t.Errorf("in-progress should be declared and empty, got %v", cardPaths(b.Columns[1]))
	}
	if paths := cardPaths(b.Columns[4]); len(paths) != 1 || paths[0] != "/backlog/d.md" {
		t.Errorf("the no-status column holds %v, want just d.md", paths)
	}
}

// The column for entries with no status appears only when it has something in
// it: an always-present empty column would be a column about nothing.
func TestNoStatusColumnOnlyWhenItHasCards(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	if err := os.Remove(filepath.Join(srv.store.Dir, "backlog", "d.md")); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.store.Rebuild(); err != nil {
		t.Fatal(err)
	}

	for _, c := range board(t, srv, "/api/board/backlog").Columns {
		if c.Value == "" {
			t.Errorf("an empty no-status column was rendered anyway")
		}
	}
}

// Filtering is `where`'s job, and its default keeps a folder that also holds
// notes from growing a column per foreign status.
func TestWhereDecidesWhatIsACard(t *testing.T) {
	b := board(t, newBoardServer(t, declaredBoard), "/api/board/backlog")
	for _, c := range b.Columns {
		for _, card := range c.Cards {
			if card.Path == "/backlog/note.md" {
				t.Errorf("a note became a card under the default where")
			}
		}
	}
}

// A bundle that configures nothing still has a kanban, so opening one is never
// gated behind editing a file.
func TestTheRootBoardNeedsNoConfig(t *testing.T) {
	srv := newBoardServer(t, "spec = \"0.1\"\n")
	b := board(t, srv, "/api/board/root")

	if b.Declared {
		t.Error("declared=true for the built-in board")
	}
	if b.Path != "/" || b.ID != "root" {
		t.Errorf("board=%+v, want the whole bundle under the root id", b)
	}
	if b.Field != "status" || b.Lane != "" {
		t.Errorf("field=%q lane=%q, want the defaults", b.Field, b.Lane)
	}
	// Nothing pins the order, so the columns are whatever the entries have.
	if got := columnValues(b); len(got) != 4 {
		t.Errorf("columns=%v, want one per status plus the unset one", got)
	}
}

// The first segment of a board address is always an id, which is what lets the
// rest of it be an entry path. A folder name there is a wrong address rather
// than an invitation to board that folder.
func TestAnIDNobodyDeclaredIsNotFound(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)

	// `/backlog` is a real folder with a real board over it, under the id
	// "backlog" — but the *path* is not an address.
	for _, path := range []string{"/api/board/3-reader", "/api/board/nonsense"} {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", path, rec.Code)
		}
	}
}

// One lane is no lanes. A board is columns of cards until the config says
// otherwise, and then every card carries its lane.
func TestLanesOnlyWhenDeclared(t *testing.T) {
	with := board(t, newBoardServer(t, declaredBoard), "/api/board/backlog")
	if with.Lane != "priority" {
		t.Fatalf("lane=%q, want priority", with.Lane)
	}
	if got := with.Columns[0].Cards[0].Lane; got != "high" {
		t.Errorf("card lane=%q, want the entry's priority", got)
	}
	// A card missing the field carries no lane rather than joining another's.
	if got := with.Columns[3].Cards[0].Lane; got != "" {
		t.Errorf("a card with no priority reported lane %q", got)
	}

	without := board(t, newBoardServer(t, "spec = \"0.1\"\n"), "/api/board/root")
	if without.Lane != "" {
		t.Errorf("lane=%q with no config", without.Lane)
	}
	for _, c := range without.Columns {
		for _, card := range c.Cards {
			if card.Lane != "" {
				t.Errorf("%s carries a lane on a board with none", card.Path)
			}
		}
	}
}

// A rail listing "/" tells you nothing. Every board is a folder and a folder
// already has a readable name, so no bundle should have to write one out.
func TestBoardsAreNamedWithoutBeingTold(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	if got := board(t, srv, "/api/board/backlog").Name; got != "Backlog" {
		t.Errorf("name=%q, want the folder made readable", got)
	}

	// The root has no folder name to borrow, so it takes the bundle's own.
	root := newBoardServer(t, "spec = \"0.1\"\n")
	if got := board(t, root, "/api/board/root").Name; got == "" || got == "/" {
		t.Errorf("root board name=%q, want the bundle's name", got)
	}

	// And the config wins when the derived one is wrong.
	named := newBoardServer(t, `spec = "0.1"

[[tool.wikiview.board]]
id   = "backlog"
path = "/backlog"
name = "This Quarter"
`)
	if got := board(t, named, "/api/board/backlog").Name; got != "This Quarter" {
		t.Errorf("name=%q, want the declared one", got)
	}
}

// A board with no id has no address. Listing it would offer a link to
// `/kanban/`, which resolves to the root board — so a broken declaration would
// look like a working board showing somebody else's cards.
func TestABoardWithNoIDIsNotOffered(t *testing.T) {
	srv := newBoardServer(t, `spec = "0.1"

[[tool.wikiview.board]]
path = "/backlog"

[[tool.wikiview.board]]
id   = "fine"
path = "/backlog"
`)
	var info BundleInfo
	if code := get(t, srv, "/api/bundle", &info); code != http.StatusOK {
		t.Fatalf("code=%d", code)
	}
	if len(info.Boards) != 1 || info.Boards[0].ID != "fine" {
		t.Errorf("boards=%+v, want only the one that can be opened", info.Boards)
	}
}

// A board matching nothing still has columns: none of them. A nil slice marshals
// as `null`, and the client read a list it had been promised — which crashed the
// view rather than showing an empty board.
func TestABoardOverNothingHasNoColumnsRatherThanNull(t *testing.T) {
	srv := newBoardServer(t, `spec = "0.1"

[[tool.wikiview.board]]
id    = "none"
path  = "/backlog"
where = ["type=task", "kind=nothing-matches-this"]
`)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/board/none", nil))
	if !strings.Contains(rec.Body.String(), `"columns":[]`) {
		t.Errorf("body = %s", rec.Body)
	}
}

// Choosing a status field, a lane, or a filter is picking from what the folder
// has, rather than recalling how this bundle spells things.
func TestBoardReportsTheFieldsInUse(t *testing.T) {
	b := board(t, newBoardServer(t, declaredBoard), "/api/board/backlog")

	fields := map[string][]string{}
	for _, f := range b.Fields {
		fields[f.Key] = f.Values
	}

	// Taken before the board's own filter: `note.md` is filtered off the board by
	// `type=task`, and `type=note` still has to be offerable as a filter.
	if got := fields["type"]; strings.Join(got, ",") != "note,task" {
		t.Errorf("type = %v", got)
	}
	// Every value a status takes, including the ones no column declares.
	if got := fields["status"]; strings.Join(got, ",") != "blocked,done,todo" {
		t.Errorf("status = %v", got)
	}
	if got := fields["priority"]; strings.Join(got, ",") != "high,low" {
		t.Errorf("priority = %v", got)
	}
	if _, ok := fields["nonesuch"]; ok {
		t.Error("a key nothing has is offered")
	}
}

// A key with more values than there are choices to make is free text, and a list
// of them is not something to pick from.
func TestBoardOffersNoValuesForFreeText(t *testing.T) {
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
	write("wiki.toml", `spec = "0.1"`)
	write("index.md", "---\nokf_version: \"0.1\"\n---\nhome\n")
	for i := range enough + 1 {
		write(fmt.Sprintf("t%02d.md", i), fmt.Sprintf("---\ntype: task\ntitle: Task %d\nstatus: todo\n---\nx\n", i))
	}
	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}

	for _, f := range board(t, New(s, nil), "/api/board/root").Fields {
		switch f.Key {
		case "title":
			if f.Values != nil {
				t.Errorf("title offers %d values, which is not a choice", len(f.Values))
			}
		case "status":
			// Still a choice, however many entries have it.
			if strings.Join(f.Values, ",") != "todo" {
				t.Errorf("status = %v", f.Values)
			}
		}
	}
}

// A list-valued key contributes its items, because that is what `tags=bug`
// matches — an inventory that said otherwise would offer values nothing can be
// filtered by.
func TestBoardListsTheItemsOfAListField(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	dir := srv.store.View().Index.Bundle.Dir
	if err := os.WriteFile(filepath.Join(dir, "backlog", "a.md"),
		[]byte("---\ntype: task\nstatus: todo\npriority: high\ntags: [ui, api]\n---\nA\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.store.Rebuild(); err != nil {
		t.Fatal(err)
	}

	for _, f := range board(t, srv, "/api/board/backlog").Fields {
		if f.Key == "tags" && strings.Join(f.Values, ",") != "api,ui" {
			t.Errorf("tags = %v", f.Values)
		}
	}
}

// A list filters — `tags=bug` matches on membership — and groups not at all, so
// the two are told apart on the wire rather than each caller guessing.
func TestBoardMarksListValuedFields(t *testing.T) {
	srv := newBoardServer(t, declaredBoard)
	dir := srv.store.View().Index.Bundle.Dir
	if err := os.WriteFile(filepath.Join(dir, "backlog", "a.md"),
		[]byte("---\ntype: task\nstatus: todo\ntags: [ui, api]\n---\nA\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.store.Rebuild(); err != nil {
		t.Fatal(err)
	}

	for _, f := range board(t, srv, "/api/board/backlog").Fields {
		want := f.Key == "tags"
		if f.List != want {
			t.Errorf("%s: list=%v, want %v", f.Key, f.List, want)
		}
	}
}
