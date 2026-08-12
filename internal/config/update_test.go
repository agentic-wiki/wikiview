package config

import (
	"strings"
	"testing"
)

// A file with everything an edit could damage: a comment, another tool's table,
// hand-aligned keys, and two boards so the wrong one can be picked.
const twoBoards = `spec = "0.1"

# A comment nobody's editor should eat.
[tool.other]
setting = "left alone"

[[tool.wikiview.board]]
id      = "backlog"
path    = "/backlog"
status  = "status"
columns = ["todo", "done"]

[[tool.wikiview.board]]
id   = "bugs"
path = "/backlog"
`

func TestUpdateChangesOnlyTheKeysItOwns(t *testing.T) {
	dir := declared(t, twoBoards)
	err := Update(dir, "backlog", Settings{
		Status:  "stage",
		Columns: []string{"todo", "doing", "done"},
	})
	if err != nil {
		t.Fatal(err)
	}

	got := read(t, dir)
	for _, want := range []string{
		"# A comment nobody's editor should eat.",
		"[tool.other]",
		`setting = "left alone"`,
		`id      = "backlog"`, // its own alignment, untouched
		`path    = "/backlog"`,
		`status  = "stage"`, // replaced in place, alignment kept
		`columns = ["todo", "doing", "done"]`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q from:\n%s", want, got)
		}
	}
	// The other board is not the one that was asked for.
	if !strings.Contains(got, "id   = \"bugs\"\npath = \"/backlog\"\n") {
		t.Errorf("the second board was disturbed:\n%s", got)
	}

	cfg, problems := loadDir(t, dir)
	if len(problems) != 0 {
		t.Errorf("problems = %v", problems)
	}
	if cfg.Board[0].Status != "stage" {
		t.Errorf("boards = %+v", cfg.Board)
	}
}

// A key the table does not have yet goes in it, above the blank line that
// separates it from whatever comes next — not into the table below.
func TestUpdateAddsAKeyToTheRightTable(t *testing.T) {
	dir := declared(t, twoBoards)
	if err := Update(dir, "backlog", Settings{Lane: "priority", Where: []string{"type=task", "kind=bug"}}); err != nil {
		t.Fatal(err)
	}

	cfg, problems := loadDir(t, dir)
	if len(problems) != 0 {
		t.Errorf("problems = %v", problems)
	}
	if len(cfg.Board) != 2 {
		t.Fatalf("boards = %+v", cfg.Board)
	}
	if cfg.Board[0].Lane != "priority" {
		t.Errorf("lane did not land on the first board: %+v", cfg.Board[0])
	}
	if cfg.Board[1].Lane != "" {
		t.Errorf("lane leaked into the second board: %+v", cfg.Board[1])
	}
	if strings.Join(cfg.Board[0].Where, ",") != "type=task,kind=bug" {
		t.Errorf("where = %v", cfg.Board[0].Where)
	}

	// Written at the end of the table's own keys rather than after the blank line
	// below them, which parses the same and reads like it belongs to the table
	// underneath. And lined up the way the table already was, since disturbing
	// the file is the one thing this writer is for not doing.
	want := "path    = \"/backlog\"\nwhere   = [\"type=task\", \"kind=bug\"]\nlane    = \"priority\"\n\n[[tool.wikiview.board]]"
	if got := read(t, dir); !strings.Contains(got, want) {
		t.Errorf("the new keys are not at the end of the table, lined up with it:\n%s", got)
	}
}

// A table nobody lined up gets no alignment invented for it.
func TestUpdateDoesNotInventAlignment(t *testing.T) {
	dir := declared(t, `spec = "0.1"

[[tool.wikiview.board]]
id = "backlog"
path = "/backlog"
`)
	if err := Update(dir, "backlog", Settings{Lane: "priority"}); err != nil {
		t.Fatal(err)
	}
	if got := read(t, dir); !strings.Contains(got, "path = \"/backlog\"\nlane = \"priority\"\n") {
		t.Errorf("wiki.toml = %q", got)
	}
}

// A setting cleared is a key removed. `lane = ""` is a lane called "", which is
// not what "no lanes" means, and `columns = []` says the same as saying nothing.
func TestUpdateRemovesWhatIsCleared(t *testing.T) {
	dir := declared(t, twoBoards)
	if err := Update(dir, "backlog", Settings{}); err != nil {
		t.Fatal(err)
	}

	got := read(t, dir)
	for _, gone := range []string{"status", "columns", "lane"} {
		if strings.Contains(got, gone) {
			t.Errorf("%q survived being cleared:\n%s", gone, got)
		}
	}
	// What the board *is* is not a setting, so it stays.
	if !strings.Contains(got, `id      = "backlog"`) || !strings.Contains(got, `path    = "/backlog"`) {
		t.Errorf("id or path was removed:\n%s", got)
	}
}

// A line-based edit around a value that does not finish on its line would move a
// bracket into the wrong table, so it refuses instead of guessing.
func TestUpdateRefusesAMultiLineValue(t *testing.T) {
	dir := declared(t, `spec = "0.1"

[[tool.wikiview.board]]
id = "backlog"
path = "/backlog"
columns = [
  "todo",
  "done",
]
`)
	before := read(t, dir)
	err := Update(dir, "backlog", Settings{Status: "stage"})
	if err == nil {
		t.Fatal("accepted it")
	}
	if !strings.Contains(err.Error(), "by hand") {
		t.Errorf("error does not say what to do: %v", err)
	}
	if read(t, dir) != before {
		t.Error("a refused update wrote anyway")
	}
}

// An array that does finish on its line is ordinary, and must not be mistaken
// for one that does not.
func TestUpdateAcceptsAOneLineArray(t *testing.T) {
	dir := declared(t, twoBoards)
	if err := Update(dir, "backlog", Settings{Columns: []string{"a"}}); err != nil {
		t.Fatal(err)
	}
	if cfg, _ := loadDir(t, dir); strings.Join(cfg.Board[0].Columns, ",") != "a" {
		t.Errorf("columns = %v", cfg.Board[0].Columns)
	}
}

// `root` exists without any config, so configuring the board somebody is looking
// at has to be possible — which means declaring it.
func TestUpdateDeclaresTheRootBoard(t *testing.T) {
	dir := declared(t, `spec = "0.1"`)
	if err := Update(dir, "root", Settings{Lane: "priority", Status: "stage"}); err != nil {
		t.Fatal(err)
	}

	cfg, problems := loadDir(t, dir)
	if len(problems) != 0 {
		t.Errorf("problems = %v", problems)
	}
	if len(cfg.Board) != 1 {
		t.Fatalf("boards = %+v", cfg.Board)
	}
	if b := cfg.Board[0]; b.ID != "root" || b.Path != "/" || b.Lane != "priority" || b.Status != "stage" {
		t.Errorf("board = %+v", b)
	}

	// And a second edit updates that table rather than appending another.
	if err := Update(dir, "root", Settings{Status: "state"}); err != nil {
		t.Fatal(err)
	}
	if cfg, _ := loadDir(t, dir); len(cfg.Board) != 1 || cfg.Board[0].Status != "state" {
		t.Errorf("boards = %+v", cfg.Board)
	}
}

// Two boards over one folder is the case ids exist for, so an edit has to find
// the one asked for rather than the first table it sees.
func TestUpdateFindsTheBoardByItsID(t *testing.T) {
	dir := declared(t, twoBoards)
	if err := Update(dir, "bugs", Settings{Where: []string{"type=task", "kind=bug"}}); err != nil {
		t.Fatal(err)
	}
	cfg, _ := loadDir(t, dir)
	if len(cfg.Board[0].Where) != 1 || cfg.Board[0].Where[0] != "type=task" {
		t.Errorf("the first board's where changed: %v", cfg.Board[0].Where)
	}
	if strings.Join(cfg.Board[1].Where, ",") != "type=task,kind=bug" {
		t.Errorf("bugs.where = %v", cfg.Board[1].Where)
	}
}

func TestUpdateRefusesAnUndeclaredBoard(t *testing.T) {
	dir := declared(t, twoBoards)
	before := read(t, dir)
	if err := Update(dir, "nope", Settings{Status: "stage"}); err == nil {
		t.Fatal("accepted it")
	}
	if read(t, dir) != before {
		t.Error("a refused update wrote anyway")
	}
}

func TestUpdateRefusesUnwritableSettings(t *testing.T) {
	dir := declared(t, twoBoards)
	before := read(t, dir)
	if err := Update(dir, "backlog", Settings{Lane: "a\nb"}); err == nil {
		t.Fatal("accepted a newline")
	}
	if err := Update(dir, "backlog", Settings{Columns: []string{"ok", "a\x00b"}}); err == nil {
		t.Fatal("accepted a control character")
	}
	if read(t, dir) != before {
		t.Error("a refused update wrote anyway")
	}
}

func TestComplete(t *testing.T) {
	cases := map[string]bool{
		`"todo"`:              true,
		`["a", "b"]`:          true,
		`[`:                   false,
		`["a",`:               false,
		`"a`:                  false,
		`"a # not a comment"`: true,
		`"x" # a comment`:     true,
		`["a"] # done`:        true,
		`"it \" closes"`:      true,
	}
	for value, want := range cases {
		if got := complete(value); got != want {
			t.Errorf("complete(%s) = %v, want %v", value, got, want)
		}
	}
}
