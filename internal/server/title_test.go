package server

import "testing"

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
