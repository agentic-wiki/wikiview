package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/agentic-wiki/wiki/bundle"
	"github.com/agentic-wiki/wiki/index"
)

// A bundle with the given wiki.toml and one entry under /backlog.
func load(t *testing.T, toml string) (Config, []string) {
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
	write("index.md", "---\nokf_version: \"0.1\"\n---\nhome [t](./backlog/t.md)\n")
	write("backlog/t.md", "---\ntype: task\nstatus: todo\n---\nA task\n")

	b, err := bundle.Discover(dir)
	if err != nil {
		t.Fatal(err)
	}
	idx, err := index.Build(b)
	if err != nil {
		t.Fatal(err)
	}
	return Decode(b, idx)
}

// The reader needs no configuration, so the common bundle has none.
func TestNoSectionIsNotAProblem(t *testing.T) {
	cfg, problems := load(t, "spec = \"0.1\"\n")
	if len(cfg.Board) != 0 {
		t.Errorf("boards=%+v, want none", cfg.Board)
	}
	if len(problems) != 0 {
		t.Errorf("problems=%v, want none", problems)
	}
}

// Every key but `path` has a default, so a board can be declared in two lines.
func TestDefaultsFillInWhatIsLeftOut(t *testing.T) {
	cfg, problems := load(t, "spec = \"0.1\"\n\n[[tool.wikiview.board]]\nid = \"backlog\"\npath = \"/backlog\"\n")
	if len(problems) != 0 {
		t.Fatalf("problems=%v", problems)
	}
	if len(cfg.Board) != 1 {
		t.Fatalf("boards=%+v, want one", cfg.Board)
	}
	b := cfg.Board[0]
	if b.Status != "status" {
		t.Errorf("status=%q, want the default", b.Status)
	}
	if len(b.Where) != 1 || b.Where[0] != "type=task" {
		t.Errorf("where=%v, want the default", b.Where)
	}
	// Parsed here so no consumer re-implements the `--where` spelling.
	if len(b.Filters) != 1 || b.Filters[0].Key != "type" || b.Filters[0].Value != "task" {
		t.Errorf("filters=%+v, want type=task parsed", b.Filters)
	}
	if len(b.Columns) != 0 {
		t.Errorf("columns=%v, want inference rather than a default list", b.Columns)
	}
}

// Two backlogs in one bundle can use different vocabularies, which is why this
// is an array of tables rather than a list of paths.
func TestSeveralBoardsKeepTheirOwnSettings(t *testing.T) {
	cfg, problems := load(t, `spec = "0.1"

[[tool.wikiview.board]]
id      = "backlog"
path    = "/backlog"
columns = ["todo", "done"]
lane    = "priority"

[[tool.wikiview.board]]
id     = "everything"
path   = "/"
where  = ["type!=task"]
status = "stage"
`)
	if len(problems) != 0 {
		t.Fatalf("problems=%v", problems)
	}
	if len(cfg.Board) != 2 {
		t.Fatalf("boards=%+v, want two", cfg.Board)
	}
	if cfg.Board[0].Lane != "priority" || cfg.Board[0].Status != "status" {
		t.Errorf("first board=%+v", cfg.Board[0])
	}
	if cfg.Board[1].Status != "stage" {
		t.Errorf("second board status=%q, want its own", cfg.Board[1].Status)
	}
	if f := cfg.Board[1].Filters; len(f) != 1 || !f[0].Negate {
		t.Errorf("second board filters=%+v, want a negated one", f)
	}
}

// Same footgun class as a misspelled wiki.toml key: it decodes into nothing and
// does exactly what you did not ask for, silently.
func TestAMisspelledKeyIsReported(t *testing.T) {
	_, problems := load(t, `spec = "0.1"

[tool.wikiview]
backlogs = ["/backlog"]

[[tool.wikiview.board]]
path    = "/backlog"
collumns = ["todo"]
`)
	joined := strings.Join(problems, "\n")
	if !strings.Contains(joined, "backlogs") {
		t.Errorf("problems=%v, want the unknown top-level key named", problems)
	}
	if !strings.Contains(joined, "collumns") {
		t.Errorf("problems=%v, want the unknown board key named", problems)
	}
}

// Reported, never fatal: a board pointing at a folder somebody deleted must not
// stop the bundle being served.
func TestProblemsDoNotStopTheRest(t *testing.T) {
	cfg, problems := load(t, `spec = "0.1"

[[tool.wikiview.board]]
id    = "nowhere"
path  = "/nowhere"

[[tool.wikiview.board]]
id    = "bad"
path  = "/backlog"
where = ["this is not a filter"]

[[tool.wikiview.board]]
id   = "fine"
path = "/backlog"
`)
	joined := strings.Join(problems, "\n")
	if !strings.Contains(joined, "/nowhere") {
		t.Errorf("problems=%v, want the missing folder named", problems)
	}
	if !strings.Contains(joined, "not a filter") {
		t.Errorf("problems=%v, want the bad filter named", problems)
	}
	// All three boards survive: the config is reported on, not discarded.
	if len(cfg.Board) != 3 {
		t.Errorf("boards=%d, want all three kept", len(cfg.Board))
	}
	if len(cfg.Board[2].Filters) != 1 {
		t.Errorf("a later board lost its defaults because an earlier one was wrong")
	}
}

func TestPathIsRequired(t *testing.T) {
	_, problems := load(t, "spec = \"0.1\"\n\n[[tool.wikiview.board]]\nlane = \"priority\"\n")
	if len(problems) != 1 || !strings.Contains(problems[0], "path is required") {
		t.Errorf("problems=%v, want one about the missing path", problems)
	}
}

// The README writes the defaults out so a reader can see what they get without
// configuring anything. That makes it a second home for values that live here,
// and the two drift the first time one changes — silently, because nothing
// executes a README.
//
// So the file is read and checked. Not the prose around them, which is free to
// be rewritten, only the values themselves.
func TestREADMEDocumentsTheRealDefaults(t *testing.T) {
	readme, err := os.ReadFile(filepath.Join("..", "..", "README.md"))
	if err != nil {
		t.Fatal(err)
	}
	doc := string(readme)

	for _, want := range []string{
		`where   = ["type=task"]`,
		`status  = "status"`,
	} {
		if !strings.Contains(doc, want) {
			t.Errorf("README does not document the default as %q", want)
		}
	}
	// …and those strings are the defaults, rather than something that merely
	// used to be.
	if len(defaultWhere) != 1 || defaultWhere[0] != "type=task" {
		t.Errorf("defaultWhere=%v, and the README says type=task", defaultWhere)
	}
	if defaultStatus != "status" {
		t.Errorf("defaultStatus=%q, and the README says status", defaultStatus)
	}
}

// The point of an id: two views of one folder, which the path alone cannot
// tell apart.
func TestTwoBoardsOverOneFolderNeedIds(t *testing.T) {
	cfg, problems := load(t, `spec = "0.1"

[[tool.wikiview.board]]
id    = "all"
path  = "/backlog"

[[tool.wikiview.board]]
id    = "bugs"
path  = "/backlog"
where = ["type=task", "kind=bug"]
`)
	if len(problems) != 0 {
		t.Fatalf("problems=%v, want none: two boards over one folder is the point", problems)
	}
	if cfg.Board[0].ID != "all" || cfg.Board[1].ID != "bugs" {
		t.Errorf("ids=%q,%q", cfg.Board[0].ID, cfg.Board[1].ID)
	}
}

// An id is what a board is addressed by, so a board without one cannot be
// reached at all. Never derived: a derived id would come from the path, and
// then a board address would sometimes start with an id and sometimes with a
// folder name.
func TestIDIsRequired(t *testing.T) {
	_, problems := load(t, "spec = \"0.1\"\n\n[[tool.wikiview.board]]\npath = \"/backlog\"\n")
	if len(problems) != 1 || !strings.Contains(problems[0], "id is required") {
		t.Errorf("problems=%v, want one about the missing id", problems)
	}
}

// An id sits in the URL among folder names, so a slash in one puts it back in
// competition with them.
func TestAnIDWithASlashIsReported(t *testing.T) {
	_, problems := load(t, "spec = \"0.1\"\n\n[[tool.wikiview.board]]\nid = \"a/b\"\npath = \"/backlog\"\n")
	if len(problems) != 1 || !strings.Contains(problems[0], "slash") {
		t.Errorf("problems=%v, want one about the slash", problems)
	}
}
