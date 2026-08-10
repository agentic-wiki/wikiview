package server

import (
	"net/http"
	"strings"
	"testing"
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
	if got.Frontmatter["title"] != "A" {
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
