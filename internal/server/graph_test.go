package server

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

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
