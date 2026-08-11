package server

import (
	"net/http"
	"os"
	"path/filepath"
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

	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return New(s, nil)
}

const declaredBoard = `spec = "0.1"

[[tool.wikiview.board]]
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

// Boarding is discovery rather than permission: a folder nobody declared still
// boards, with exactly the defaults a bare declaration would have taken.
func TestAnUndeclaredFolderStillBoards(t *testing.T) {
	b := board(t, newBoardServer(t, "spec = \"0.1\"\n"), "/api/board/backlog")

	if b.Declared {
		t.Error("declared=true for a folder no config mentions")
	}
	if b.Field != "status" {
		t.Errorf("field=%q, want the default", b.Field)
	}
	if b.Lane != "" {
		t.Errorf("lane=%q, want none until asked for", b.Lane)
	}
	// Nothing pins the order here, so the columns are whatever the entries have.
	if got := columnValues(b); len(got) != 4 {
		t.Errorf("columns=%v, want one per status plus the unset one", got)
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

	without := board(t, newBoardServer(t, "spec = \"0.1\"\n"), "/api/board/backlog")
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
