package server

import "testing"

func TestTitleFromFilename(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"/2-server/003-watch-and-events.md", "Watch and events"},
		{"/notes/design.md", "Design"},
		{"/notes/my_long_name.md", "My long name"},
		{"/12_planning.md", "Planning"},
		{"/index.md", "Index"},
		// A four-digit leading number is a year, not a sort key, so it stays.
		{"/notes/2024-review.md", "2024 review"},
	} {
		if got := titleFromFilename(tc.in); got != tc.want {
			t.Errorf("titleFromFilename(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
