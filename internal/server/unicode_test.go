package server

import "testing"

func TestTitleFromFilenameUnicode(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"/notes/élan-vital.md", "Élan vital"},
		{"/notes/über-alles.md", "Über alles"},
		{"/notes/日本語.md", "日本語"},
		// A prefix pushes the letter that needs uppercasing past a multi-byte
		// boundary, which is where slicing by byte would corrupt it.
		{"/notes/003-élan-vital.md", "003 Élan vital"},
		{"/12_日本語.md", "12 日本語"},
		// Uncased scripts are left alone rather than mangled.
		{"/notes/003-日本語.md", "003 日本語"},
	} {
		if got := titleFromFilename(tc.in); got != tc.want {
			t.Errorf("titleFromFilename(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
