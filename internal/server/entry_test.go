package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/agentic-wiki/wikiview/internal/store"
)

// One representation of the content, plus lookup tables. The body is the
// markdown exactly as on disk: it is what an editor would save back and what a
// markdown pipeline with its own plugins takes as input.
func TestEntryServesSourceNotHTML(t *testing.T) {
	var got EntryView
	if code := get(t, newTestServer(t), "/api/entry/notes/a.md", &got); code != http.StatusOK {
		t.Fatalf("code=%d", code)
	}
	if got.Path != "/notes/a.md" || got.Type != "note" {
		t.Errorf("path=%q type=%q", got.Path, got.Type)
	}
	if !contains(got.Body, "# Heading") || !contains(got.Body, "[b](./b.md)") {
		t.Errorf("body should be the markdown as written, got %q", got.Body)
	}
	// No second representation of the same content.
	if contains(got.Body, "<h1") || contains(got.Body, "<a href") {
		t.Errorf("the body should not be rendered: %q", got.Body)
	}
	if got.Frontmatter["title"] != "The first note" {
		t.Errorf("title=%v", got.Frontmatter["title"])
	}
	if tags, ok := got.Frontmatter["tags"].([]any); !ok || len(tags) != 2 {
		t.Errorf("tags=%#v, want a two-element list", got.Frontmatter["tags"])
	}
	if len(got.Checkboxes) != 2 || got.Checkboxes[0].Done || !got.Checkboxes[1].Done {
		t.Errorf("checkboxes=%+v", got.Checkboxes)
	}
}

// The client resolves a link by looking up the href it encounters, so the raw
// on-disk spelling has to be the key. Without it the client would be doing path
// arithmetic against the bundle root, which is the engine's rule.
func TestLinksAreKeyedByTheirRawForm(t *testing.T) {
	var got EntryView
	get(t, newTestServer(t), "/api/entry/notes/a.md", &got)

	byRaw := map[string]LinkView{}
	for _, l := range got.Links {
		byRaw[l.Raw] = l
	}
	b, ok := byRaw["./b.md"]
	if !ok {
		t.Fatalf("no entry keyed by the raw href; got %+v", got.Links)
	}
	if b.To != "/notes/b.md" || !b.Exists {
		t.Errorf("./b.md -> %+v, want /notes/b.md and Exists", b)
	}
	// A link to an entry that is not written yet is not an error, and must still
	// appear so the reader can show it differently.
	missing, ok := byRaw["./missing.md"]
	if !ok || missing.Exists || missing.To != "/notes/missing.md" {
		t.Errorf("./missing.md -> %+v, want resolved with Exists=false", missing)
	}
}

// Every markdown library ships its own slugger and they disagree in small ways,
// so the ids travel as data rather than being generated client-side.
func TestHeadingsCarryTheirIDs(t *testing.T) {
	var got EntryView
	get(t, newTestServer(t), "/api/entry/notes/a.md", &got)
	if len(got.Headings) != 1 {
		t.Fatalf("headings=%+v", got.Headings)
	}
	h := got.Headings[0]
	if h.Text != "Heading" || h.ID != "heading" || h.Level != 1 {
		t.Errorf("heading=%+v", h)
	}
}

func TestTreeEndpoint(t *testing.T) {
	var root TreeNode
	if code := get(t, newTestServer(t), "/api/tree", &root); code != http.StatusOK {
		t.Fatalf("code=%d", code)
	}
	if root.Path != "/" {
		t.Errorf("root path=%q", root.Path)
	}
	// The bundle root's index.md is what the reader opens on.
	if root.Index != "/index.md" {
		t.Errorf("root index=%q, want /index.md", root.Index)
	}
	if len(root.Children) != 1 || root.Children[0].Path != "/notes" {
		t.Fatalf("children=%+v", root.Children)
	}
	notes := root.Children[0]
	// A folder is a navigation step like any other, so it is named by the same
	// rule its entries are.
	if notes.Label != "Notes" {
		t.Errorf("folder label=%q, want %q", notes.Label, "Notes")
	}
	// This folder has no index.md, which is what tells the reader that
	// navigating to it has to synthesize a listing rather than redirect.
	if notes.Index != "" {
		t.Errorf("notes.Index=%q, want empty for a folder with no index.md", notes.Index)
	}
	if len(notes.Entries) != 2 {
		t.Errorf("notes entries=%+v, want a.md and b.md", notes.Entries)
	}
	// Stable order, so the client does not see the tree reshuffle between calls.
	if notes.Entries[0].Name != "a.md" || notes.Entries[1].Name != "b.md" {
		t.Errorf("entries out of order: %+v", notes.Entries)
	}
}

func contains(haystack, needle string) bool { return strings.Contains(haystack, needle) }

// Which frontmatter fields hold references is not something to hardcode.
// `blockers` and `epic` are conventions; a bundle is free to invent `supersedes`
// or `source`, and a fixed list would make those inert.
func TestFrontmatterRefsAreFoundByValue(t *testing.T) {
	dir := t.TempDir()
	write := func(name, content string) {
		p := filepath.Join(dir, filepath.FromSlash(name))
		os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("wiki.toml", "spec = \"0.1\"\n")
	write("index.md", "---\nokf_version: \"0.1\"\n---\nhome [a](./a.md)\n")
	write("target.md", "---\ntype: note\ntitle: The Target\n---\nt\n")
	write("other.md", "---\ntype: note\n---\no\n")
	write("a.md", "---\ntype: task\n"+
		// A scalar reference, a list of them, an invented field name, a value
		// that names nothing, and a plain string that is not a path at all.
		"epic: /target.md\n"+
		"blockers: [/target.md, /other.md]\n"+
		"supersedes: /target.md\n"+
		"missing: /never-written.md\n"+
		"title: Some Note\n"+
		"---\nbody\n")

	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	var got EntryView
	if code := get(t, New(s, nil), "/api/entry/a.md", &got); code != http.StatusOK {
		t.Fatalf("code=%d", code)
	}

	byKey := map[string][]string{}
	for _, r := range got.FrontmatterRefs {
		byKey[r.Key] = append(byKey[r.Key], r.To)
	}
	// A scalar and a list are the same kind of reference, one of them repeated.
	if len(byKey["epic"]) != 1 || byKey["epic"][0] != "/target.md" {
		t.Errorf("epic refs = %v", byKey["epic"])
	}
	if len(byKey["blockers"]) != 2 {
		t.Errorf("blockers refs = %v, want both", byKey["blockers"])
	}
	// An invented field is found on the same terms as a conventional one.
	if len(byKey["supersedes"]) != 1 {
		t.Errorf("an unconventional field should resolve too: %v", byKey)
	}
	// A value naming nothing is ordinary text, not a broken link.
	if _, ok := byKey["missing"]; ok {
		t.Errorf("an unresolvable value should not be a reference: %v", byKey)
	}
	// And a plain string is not treated as a path, which is what the .md suffix
	// gate is for — "Some Note" would otherwise resolve against the bundle root.
	if _, ok := byKey["title"]; ok {
		t.Errorf("a non-path string became a reference: %v", byKey)
	}
	// A readable name travels, so the client shows a name rather than a path —
	// and it is the target's filename, the same name the tree gives it, not the
	// title the target happens to carry.
	for _, r := range got.FrontmatterRefs {
		if r.To == "/target.md" && r.Label != "Target" {
			t.Errorf("ref label = %q, want the target's filename made readable", r.Label)
		}
	}
}

// A tree row names the file you would navigate to. An entry that titles itself
// something else keeps that title, but nowhere in navigation does it replace
// the filename: renaming rows out from under you makes the tree unnavigable.
func TestLabelComesFromTheFilenameNotTheTitle(t *testing.T) {
	var root TreeNode
	if code := get(t, newTestServer(t), "/api/tree", &root); code != http.StatusOK {
		t.Fatalf("code=%d", code)
	}
	notes := root.Children[0]
	a := notes.Entries[0]
	if a.Name != "a.md" {
		t.Fatalf("fixture moved: entries[0]=%q", a.Name)
	}
	if a.Label != "A" {
		t.Errorf("label=%q, want %q from the filename", a.Label, "A")
	}
	// Carried alongside, for the entry's own page and for search to match.
	if a.Title != "The first note" {
		t.Errorf("title=%q, want the entry's own", a.Title)
	}

	// An entry with no title of its own carries none, rather than a copy of the
	// label dressed up as one.
	b := notes.Entries[1]
	if b.Label != "B" || b.Title != "" {
		t.Errorf("b.md label=%q title=%q, want %q and empty", b.Label, b.Title, "B")
	}
}

// Navigation names every entry, including one with no title of its own, and it
// never falls back to showing a raw filename.
func TestEveryEntryHasALabel(t *testing.T) {
	var root TreeNode
	if code := get(t, newTestServer(t), "/api/tree", &root); code != http.StatusOK {
		t.Fatalf("code=%d", code)
	}
	var check func(n *TreeNode)
	check = func(n *TreeNode) {
		for _, e := range n.Entries {
			if e.Label == "" {
				t.Errorf("%s has no label", e.Path)
			}
			if strings.HasSuffix(e.Label, ".md") {
				t.Errorf("%s shows a filename (%q) where a name belongs", e.Path, e.Label)
			}
		}
		for _, c := range n.Children {
			check(c)
		}
	}
	check(&root)
}
