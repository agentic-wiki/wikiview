package server

import (
	"path/filepath"
	"testing"
)

func TestTitleFromFilename(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"/notes/design.md", "Design"},
		{"/notes/my_long_name.md", "My long name"},
		{"/index.md", "Index"},

		// A leading number orders the folder, so it is part of the name rather
		// than noise in front of it. Dropping it would leave the tree sorted one
		// way and labelled as if it were sorted another.
		{"/2-server/003-watch-and-events.md", "003 Watch and events"},
		{"/12_planning.md", "12 Planning"},
		{"/notes/2024-review.md", "2024 Review"},
		{"/003_deep_dive.md", "003 Deep dive"}, // underscores separate too
		{"/10-20-thing.md", "10 20 Thing"},     // more than one leading number
		// Folders are named by the same rule, prefix and all.
		{"/2-servers", "2 Servers"},

		// Capitalization finds the first word starting with a letter, and stops
		// at word boundaries: reaching inside one would give "2024Review".
		{"/notes/2024review.md", "2024review"},

		// Nothing to capitalize is not a failure.
		{"/007.md", "007"},
		{"/1-2-3.md", "1 2 3"},

		// Degenerate names still produce something rather than an empty label.
		{"/-.md", "-.md"},
		{"/notes/.md", ".md"},
	} {
		if got := titleFromFilename(tc.in); got != tc.want {
			t.Errorf("titleFromFilename(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// A bundle's directory is a path on this machine, not a bundle path, so its
// separators are the operating system's. `path.Base` finds nothing to split in
// `C:\Users\my-kb` and hands back the whole string, which is how the bundle
// name ends up reading as a full Windows path in the corner of the page.
//
// Built with filepath.Join so this asserts the same thing on either platform.
func TestDirLabelUsesTheOperatingSystemsSeparators(t *testing.T) {
	for _, tc := range []struct {
		parts []string
		want  string
	}{
		{[]string{"home", "user", "my-kb"}, "My kb"},
		{[]string{"Users", "me", "notes_and_things"}, "Notes and things"},
		{[]string{"srv", "2-second-brain"}, "2 Second brain"},
	} {
		dir := filepath.Join(tc.parts...)
		if got := dirLabel(dir); got != tc.want {
			t.Errorf("dirLabel(%q) = %q, want %q", dir, got, tc.want)
		}
	}
}

// A backlinks footer is the one place a folder's index.md needs qualifying.
// The tree and the breadcrumb show it inside the folder it belongs to, and the
// palette shows the path beside it, so "Index" reads correctly there. A list of
// entries linking here does not, and several rows all reading "Index" say
// nothing about which entries they are.
func TestBacklinkNameQualifiesAFolderIndex(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"/1-design/index.md", "1 Design (index)"},
		{"/notes/deep/index.md", "Deep (index)"},
		{"/index.md", "Index"}, // the root: no folder to borrow from
		{"/notes/a.md", "A"},   // anything else is named the usual way
		{"/2-server/003-watch.md", "003 Watch"},
	} {
		if got := backlinkName(tc.in); got != tc.want {
			t.Errorf("backlinkName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}

	// And the rule stays out of the name everything else uses.
	if got := titleFromFilename("/1-design/index.md"); got != "Index" {
		t.Errorf("titleFromFilename on a folder index = %q, want %q", got, "Index")
	}
}
