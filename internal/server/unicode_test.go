package server

import "testing"

func TestTitleFromFilenameUnicode(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"/notes/élan-vital.md", "Élan vital"},
		{"/notes/über-alles.md", "Über alles"},
		{"/notes/日本語.md", "日本語"},
	} {
		if got := titleFromFilename(tc.in); got != tc.want {
			t.Errorf("titleFromFilename(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
