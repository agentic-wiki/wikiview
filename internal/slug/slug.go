// Package slug generates the heading ids an `#anchor` link resolves against.
//
// This duplicates the engine's rule, which is unexported. That is the exact
// thing this repo exists not to do, and it is here because the alternative is
// worse: every markdown library ships its own slugger with its own opinion, and
// they are *almost* right. goldmark turns `and_underscore` into
// `and-underscore`; the engine keeps the underscore, matching GitHub, which is
// what the format's anchor checking compares against.
//
// A near-match is the worst outcome, because `wiki check` calls the anchor valid
// while the reader silently fails to scroll to it, and nothing reports anything.
//
// So the rule is written out here, the ids are shipped to the client as data so
// no JS slugger can disagree with them, and a test cross-checks every generated
// id against the real `wiki` binary. Filed upstream to be exported; this file
// deletes when it is.
package slug

import (
	"fmt"
	"strings"
	"unicode"
)

// Headings assigns an id to each heading text, in document order.
//
// Order matters: repeats are disambiguated the way GitHub does and the engine
// expects — the first occurrence keeps the bare slug and the Nth gains a "-N"
// suffix, so a second "## Notes" is reachable as `#notes-1`. The numbering only
// means anything across a whole document, which is why this takes the sequence
// rather than one heading at a time.
func Headings(texts []string) []string {
	seen := map[string]int{}
	out := make([]string, len(texts))
	for i, text := range texts {
		s := One(text)
		n := seen[s]
		seen[s] = n + 1
		if n > 0 {
			s = fmt.Sprintf("%s-%d", s, n)
		}
		out[i] = s
	}
	return out
}

// One slugs a single heading: lower-cased, spaces to hyphens, keeping letters,
// numbers, hyphens and underscores, dropping everything else.
//
// Exported for testing the rule in isolation; callers rendering a document want
// Headings, which also handles repeats.
func One(text string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(text) {
		switch {
		case r == ' ':
			b.WriteByte('-')
		case unicode.IsLetter(r) || unicode.IsNumber(r) || r == '-' || r == '_':
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "heading"
	}
	return b.String()
}
