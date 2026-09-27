package server

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/agentic-wiki/wikiview/internal/config"
	"github.com/agentic-wiki/wikiview/internal/store"
)

// A bundle of people who link each other in every way a link can be written,
// and in the ways that are not an edge at all.
func newGraphServer(t *testing.T, toml string) *Server {
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
	// Ana links Bo in the body, Cy through frontmatter, herself, somebody not yet
	// written, and an organisation outside the folder.
	write("people/ana.md", "---\ntype: person\ntitle: Ana Ruiz\nmanager: ./cy.md\n---\n"+
		"[Bo](./bo.md), [me](./ana.md), [ghost](./ghost.md), [Acme](../orgs/acme.md)\n")
	// Bo links Ana back twice, and an image beside the notes.
	write("people/bo.md", "---\ntype: person\n---\n[Ana](./ana.md) and [again](ana.md#top) ![p](./pic.png)\n")
	write("people/pic.png", "png")
	write("people/cy.md", "---\ntype: person\n---\nCy\n")
	// Links nobody and linked by nobody.
	write("people/dee.md", "---\ntype: person\n---\nDee\n")
	// In the folder, failing the filter, pointing in.
	write("people/rex.md", "---\ntype: pet\nowner: [/people/ana.md]\n---\nRex\n")
	// Outside the folder: Acme links a filtered entry and an entry nobody on the
	// graph links, which is two hops out.
	write("orgs/acme.md", "---\ntype: org\n---\n[Bo](../people/bo.md) [other](./other.md)\n")
	write("orgs/other.md", "---\ntype: org\n---\n[Acme](./acme.md)\n")

	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return New(s, nil)
}

func graphTOML(extra string) string {
	return "spec = \"0.1\"\n\n[[tool.wikiview.graph]]\nid = \"people\"\npath = \"/people\"\n" + extra
}

func fetchGraph(t *testing.T, srv *Server, id string) GraphView {
	t.Helper()
	var got GraphView
	if code := get(t, srv, "/api/graph/"+id, &got); code != http.StatusOK {
		t.Fatalf("GET /api/graph/%s = %d", id, code)
	}
	return got
}

func nodePaths(g GraphView) []string {
	out := []string{}
	for _, n := range g.Nodes {
		mark := ""
		if n.Neighbour {
			mark = " (neighbour)"
		}
		out = append(out, n.Path+mark)
	}
	return out
}

func edgeStrings(g GraphView) []string {
	out := []string{}
	for _, e := range g.Edges {
		arrow := "->"
		if e.Mutual {
			arrow = "<->"
		}
		out = append(out, fmt.Sprintf("%s %s %s via %s x%d", e.From, arrow, e.To, strings.Join(e.Via, ","), e.Count))
	}
	return out
}

func assertSame(t *testing.T, what string, got, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Errorf("%s:\n got %q\nwant %q", what, got, want)
	}
}

// The core of it: the filtered entries are the nodes, isolated ones included,
// and an edge is a link between two of them, from the body or the frontmatter.
// A self-link, an unwritten target, an asset and an entry outside the filter
// are none of them edges.
func TestAGraphIsTheFilteredEntriesAndTheLinksBetweenThem(t *testing.T) {
	g := fetchGraph(t, newGraphServer(t, graphTOML(`where = ["type=person"]`+"\n")), "people")

	assertSame(t, "nodes", nodePaths(g), []string{
		"/people/ana.md", "/people/bo.md", "/people/cy.md", "/people/dee.md",
	})
	// The keys under the folder, before the filter: `pet` is offerable because
	// choosing a filter is choosing from what is there, not from what passes.
	i := slices.IndexFunc(g.Fields, func(f Field) bool { return f.Key == "type" })
	if i < 0 || !slices.Equal(g.Fields[i].Values, []string{"person", "pet"}) {
		t.Errorf("fields=%+v, want type offering person and pet", g.Fields)
	}
	assertSame(t, "edges", edgeStrings(g), []string{
		// Three links, two of them from Bo, the second with an anchor: one edge.
		"/people/ana.md <-> /people/bo.md via body x3",
		"/people/ana.md -> /people/cy.md via manager x1",
	})
	if g.Name != "People" {
		t.Errorf("name=%q, want the folder made readable", g.Name)
	}
	if g.Nodes[0].Title != "Ana Ruiz" || g.Nodes[0].Label != "Ana" {
		t.Errorf("node=%+v, want its title and its filename label", g.Nodes[0])
	}
}

// No default filter, unlike a board: a graph assumes nothing about types, so
// without `where` it is everything in the folder.
func TestWithoutWhereAGraphIsTheWholeFolder(t *testing.T) {
	g := fetchGraph(t, newGraphServer(t, graphTOML("")), "people")

	assertSame(t, "nodes", nodePaths(g), []string{
		"/people/ana.md", "/people/bo.md", "/people/cy.md", "/people/dee.md", "/people/rex.md",
	})
	assertSame(t, "edges", edgeStrings(g), []string{
		"/people/ana.md <-> /people/bo.md via body x3",
		"/people/ana.md -> /people/cy.md via manager x1",
		"/people/rex.md -> /people/ana.md via owner x1",
	})
}

// Neighbours are one hop out in both directions and marked as such, with no
// edge between two of them: that would be a graph two hops out.
func TestNeighboursAreOneHopOut(t *testing.T) {
	g := fetchGraph(t, newGraphServer(t, graphTOML(`where = ["type=person"]`+"\nneighbours = true\n")), "people")

	assertSame(t, "nodes", nodePaths(g), []string{
		"/orgs/acme.md (neighbour)", // linked from Ana, and links Bo
		"/people/ana.md", "/people/bo.md", "/people/cy.md", "/people/dee.md",
		"/people/rex.md (neighbour)", // links Ana, from inside the folder
	})
	assertSame(t, "edges", edgeStrings(g), []string{
		"/orgs/acme.md -> /people/bo.md via body x1",
		"/people/ana.md -> /orgs/acme.md via body x1",
		"/people/ana.md <-> /people/bo.md via body x3",
		"/people/ana.md -> /people/cy.md via manager x1",
		"/people/rex.md -> /people/ana.md via owner x1",
	})
}

// One pair linked through the body and through a field is one edge that says
// both, and a mutual pair is spelled the same way whichever side is read first.
func TestOneEdgePerPairWhateverWroteIt(t *testing.T) {
	srv := newGraphServer(t, graphTOML(`where = ["type=person"]`+"\n"))
	write := func(name, content string) {
		if err := os.WriteFile(filepath.Join(srv.store.Dir, filepath.FromSlash(name)), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	// Cy names Ana back through a list, and Ana's body names Cy too.
	write("people/cy.md", "---\ntype: person\nreports: [/people/ana.md]\n---\nCy\n")
	write("people/ana.md", "---\ntype: person\nmanager: ./cy.md\n---\n[Cy](./cy.md)\n")
	if _, err := srv.store.Rebuild(); err != nil {
		t.Fatal(err)
	}

	assertSame(t, "edges", edgeStrings(fetchGraph(t, srv, "people")), []string{
		"/people/ana.md <-> /people/cy.md via body,manager,reports x3",
		// Ana no longer links Bo, so the pair that was mutual now points one way.
		"/people/bo.md -> /people/ana.md via body x2",
	})
}

func TestAGraphNobodyDeclaredIsNotFound(t *testing.T) {
	srv := newGraphServer(t, graphTOML(""))
	for _, path := range []string{"/api/graph/nobody", "/api/graph/root"} {
		if code := get(t, srv, path, nil); code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404: no graph is built in", path, code)
		}
	}
}

// A graph missing its path is reported at startup and served nowhere. Served, it
// would be the whole bundle, because an empty prefix is how the index spells
// that.
func TestAGraphWithoutAPathIsNotServed(t *testing.T) {
	srv := newGraphServer(t, "spec = \"0.1\"\n\n[[tool.wikiview.graph]]\nid = \"all\"\n")
	if code := get(t, srv, "/api/graph/all", nil); code != http.StatusNotFound {
		t.Errorf("GET /api/graph/all = %d, want 404", code)
	}
	var b BundleInfo
	get(t, srv, "/api/bundle", &b)
	if len(b.Graphs) != 0 {
		t.Errorf("graphs=%+v, want none offered", b.Graphs)
	}
}

// Graphs are listed with the bundle, named, and their ids do not compete with
// the boards': a board and a graph may both be called people.
func TestTheBundleListsItsGraphs(t *testing.T) {
	srv := newGraphServer(t, graphTOML("name = \"Who knows whom\"\n")+
		"\n[[tool.wikiview.graph]]\nid = \"orgs\"\npath = \"/orgs\"\n"+
		"\n[[tool.wikiview.board]]\nid = \"people\"\npath = \"/people\"\n")
	var b BundleInfo
	get(t, srv, "/api/bundle", &b)
	var names []string
	for _, g := range b.Graphs {
		names = append(names, g.ID+"="+g.Name)
	}
	assertSame(t, "graphs", names, []string{"people=Who knows whom", "orgs=Orgs"})
	if len(b.Boards) != 1 || b.Boards[0].ID != "people" {
		t.Errorf("boards=%+v, want the board of the same id alongside", b.Boards)
	}
	if g := fetchGraph(t, srv, "orgs"); len(g.Nodes) != 2 {
		t.Errorf("orgs nodes=%v", nodePaths(g))
	}
}

// Nodes and edges are lists even when empty: a client reading a list it was
// promised has no reason to check for null.
func TestAGraphOverNothingHasEmptyLists(t *testing.T) {
	g := fetchGraph(t, newGraphServer(t, graphTOML(`where = ["type=robot"]`+"\n")), "people")
	if g.Nodes == nil || g.Edges == nil || len(g.Nodes) != 0 {
		t.Errorf("nodes=%v edges=%v, want two empty lists", g.Nodes, g.Edges)
	}
}

// Declaring a graph writes the table and nothing else, and the graph it wrote is
// one the server then serves — the only proof the file parses as intended.
func TestDeclareGraphAppendsToWikiToml(t *testing.T) {
	srv := newGraphServer(t, "spec = \"0.1\"\n# the user's comment\n")
	at := versionOf(t, srv)

	code, after := post(t, srv, "/api/graph", declareRequest{ID: "people", Path: "/people/", Name: "People I know"})
	if code != http.StatusOK {
		t.Fatalf("POST = %d, want 200", code)
	}
	if after == at {
		t.Errorf("version did not move: %d", after)
	}
	got := raw(t, srv, "wiki.toml")
	for _, want := range []string{"# the user's comment", "[[tool.wikiview.graph]]", `id   = "people"`, `path = "/people"`, `name = "People I know"`} {
		if !strings.Contains(got, want) {
			t.Errorf("wiki.toml is missing %q: %q", want, got)
		}
	}
	// No filter written: a graph has no default one to spell out.
	if strings.Contains(got, "where") {
		t.Errorf("wrote a filter nobody chose: %q", got)
	}
	if g := fetchGraph(t, srv, "people"); g.Name != "People I know" || len(g.Nodes) != 5 {
		t.Errorf("graph = %s, %v", g.Name, nodePaths(g))
	}
}

func TestDeclareGraphRefusesWhatCannotBeAddressed(t *testing.T) {
	cases := []struct {
		why string
		req declareRequest
	}{
		{"an id with a slash", declareRequest{ID: "a/b", Path: "/people"}},
		{"an empty id", declareRequest{ID: "", Path: "/people"}},
		{"an id another graph has", declareRequest{ID: "people", Path: "/orgs"}},
		{"a folder with nothing in it", declareRequest{ID: "none", Path: "/nowhere"}},
		{"a name that would break the file", declareRequest{ID: "ok", Path: "/people", Name: "a\nb"}},
	}
	for _, c := range cases {
		t.Run(c.why, func(t *testing.T) {
			srv := newGraphServer(t, graphTOML(""))
			before := raw(t, srv, "wiki.toml")
			if code, _ := post(t, srv, "/api/graph", c.req); code != http.StatusUnprocessableEntity {
				t.Errorf("POST = %d, want 422", code)
			}
			if raw(t, srv, "wiki.toml") != before {
				t.Error("a refused declaration wrote to wiki.toml anyway")
			}
		})
	}
}

// A board's id is not a graph's: declaring a graph called what a board is
// called is allowed, and leaves the board what it was.
func TestAGraphMayTakeABoardsID(t *testing.T) {
	srv := newGraphServer(t, "spec = \"0.1\"\n\n[[tool.wikiview.board]]\nid = \"people\"\npath = \"/people\"\nwhere = []\n")
	if code, _ := post(t, srv, "/api/graph", declareRequest{ID: "people", Path: "/orgs"}); code != http.StatusOK {
		t.Fatalf("POST = %d, want 200", code)
	}
	if g := fetchGraph(t, srv, "people"); g.Path != "/orgs" {
		t.Errorf("graph path = %s", g.Path)
	}
	if b := board(t, srv, "/api/board/people"); b.Path != "/people" {
		t.Errorf("board path = %s: declaring the graph disturbed the board", b.Path)
	}
}

func TestGraphSettingsAreWritten(t *testing.T) {
	srv := newGraphServer(t, graphTOML("# kept\n"))

	code, _ := put(t, srv, "/api/graph/people", config.GraphSettings{
		Name: "Who", Where: []string{"type=person"}, Neighbours: true,
	})
	if code != http.StatusOK {
		t.Fatalf("PUT = %d, want 200", code)
	}
	got := raw(t, srv, "wiki.toml")
	for _, want := range []string{"# kept", `name = "Who"`, `where = ["type=person"]`, "neighbours = true"} {
		if !strings.Contains(got, want) {
			t.Errorf("wiki.toml is missing %q: %q", want, got)
		}
	}
	g := fetchGraph(t, srv, "people")
	if g.Name != "Who" || !g.Neighbours || len(g.Where) != 1 {
		t.Errorf("graph = %+v", g)
	}

	// Cleared is removed: no filter is no key, and neighbours off is no key.
	if code, _ := put(t, srv, "/api/graph/people", config.GraphSettings{}); code != http.StatusOK {
		t.Fatalf("PUT = %d, want 200", code)
	}
	got = raw(t, srv, "wiki.toml")
	for _, gone := range []string{"name", "where", "neighbours"} {
		if strings.Contains(got, gone+" ") {
			t.Errorf("%s survived being cleared: %q", gone, got)
		}
	}
	if !strings.Contains(got, `id = "people"`) || !strings.Contains(got, `path = "/people"`) {
		t.Errorf("clearing the settings touched what the graph is: %q", got)
	}
}

func TestGraphSettingsRefuseWhatCannotBeMeant(t *testing.T) {
	srv := newGraphServer(t, graphTOML(""))
	before := raw(t, srv, "wiki.toml")
	if code, _ := put(t, srv, "/api/graph/people", config.GraphSettings{Where: []string{"no filter here"}}); code != http.StatusUnprocessableEntity {
		t.Errorf("a bad filter: PUT = %d, want 422", code)
	}
	if code, _ := put(t, srv, "/api/graph/nobody", config.GraphSettings{}); code != http.StatusNotFound {
		t.Errorf("an undeclared graph: PUT = %d, want 404", code)
	}
	if raw(t, srv, "wiki.toml") != before {
		t.Error("a refused update wrote to wiki.toml anyway")
	}
}

// Updating one table of a kind must not find the other kind's table of the same
// id: a board and a graph called people are two different lines to edit.
func TestGraphSettingsLeaveTheSameIDsBoardAlone(t *testing.T) {
	srv := newGraphServer(t, "spec = \"0.1\"\n\n[[tool.wikiview.board]]\nid = \"people\"\npath = \"/people\"\n\n"+
		"[[tool.wikiview.graph]]\nid = \"people\"\npath = \"/people\"\n")
	if code, _ := put(t, srv, "/api/graph/people", config.GraphSettings{Name: "Graph"}); code != http.StatusOK {
		t.Fatalf("PUT = %d", code)
	}
	got := raw(t, srv, "wiki.toml")
	board, graph, _ := strings.Cut(got, "[[tool.wikiview.graph]]")
	if strings.Contains(board, "name") || !strings.Contains(graph, `name = "Graph"`) {
		t.Errorf("the edit landed in the wrong table: %q", got)
	}
}
