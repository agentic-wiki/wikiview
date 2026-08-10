package slug

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestOne(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"Simple", "simple"},
		{"Two Words", "two-words"},
		// The case every general-purpose slugger gets differently: an underscore
		// is a word character and survives, matching GitHub and the engine.
		{"With-Hyphen and_underscore", "with-hyphen-and_underscore"},
		{"Punctuation: removed, right?", "punctuation-removed-right"},
		{"MiXeD CaSe", "mixed-case"},
		{"Numbers 123", "numbers-123"},
		{"", "heading"},
		{"!!!", "heading"},
	} {
		if got := One(tc.in); got != tc.want {
			t.Errorf("One(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// The numbering only means anything across a whole document, which is why the
// API takes the sequence.
func TestHeadingsDisambiguatesRepeats(t *testing.T) {
	got := Headings([]string{"Notes", "Other", "Notes", "Notes"})
	want := []string{"notes", "other", "notes-1", "notes-2"}
	if !slices.Equal(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

// The rule is a copy of one the engine keeps unexported, so it is checked
// against the engine's own behaviour rather than against this code. Each id
// becomes an `#anchor` link in a bundle; `wiki check` warns when an anchor
// matches no heading, so a clean run means the engine agrees with every id.
//
// This is the guard that makes the duplication survivable until the rule is
// exported upstream. It fails the build the moment they diverge.
func TestIDsAgreeWithTheEngine(t *testing.T) {
	wikiBin := findWiki(t)

	headings := []string{
		"Simple", "Two Words", "With-Hyphen and_underscore",
		"Punctuation: removed, right?", "MiXeD CaSe", "Numbers 123",
		"Trailing underscore_", "__dunder__", "Notes", "Notes",
	}
	ids := Headings(headings)

	var body strings.Builder
	for _, h := range headings {
		body.WriteString("## " + h + "\n\n")
	}
	for _, id := range ids {
		body.WriteString("[to](#" + id + ")\n\n")
	}

	dir := t.TempDir()
	for name, content := range map[string]string{
		"wiki.toml": "spec = \"0.1\"\n",
		"index.md":  "---\nokf_version: \"0.1\"\n---\nhome [a](./a.md)\n",
		"a.md":      "---\ntype: note\n---\n" + body.String(),
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	out, err := exec.Command(wikiBin, "--root", dir, "check").CombinedOutput()
	if err != nil && !strings.Contains(string(out), "warning") {
		t.Fatalf("running wiki check: %v\n%s", err, out)
	}
	if strings.Contains(string(out), "anchor") {
		t.Errorf("the engine rejects ids this package generated, so the rule has diverged:\n%s", out)
	}
}

// findWiki locates the engine binary. The cross-check is only meaningful against
// a real one, so the test skips rather than pretending when it is absent.
func findWiki(t *testing.T) string {
	t.Helper()
	if p, err := exec.LookPath("wiki"); err == nil {
		return p
	}
	for _, p := range []string{"../../../wiki/bin/wiki", "../../bin/wiki"} {
		if abs, err := filepath.Abs(p); err == nil {
			if _, err := os.Stat(abs); err == nil {
				return abs
			}
		}
	}
	t.Skip("no wiki binary found; cannot cross-check ids against the engine")
	return ""
}
