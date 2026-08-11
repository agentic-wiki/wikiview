package server

import (
	"net/http"
	"strings"

	"github.com/agentic-wiki/wiki/index"
	"github.com/agentic-wiki/wikiview/internal/slug"
)

// EntryView is one entry as the reader needs it.
//
// One representation of the content — the markdown exactly as on disk — plus
// lookup tables for the two things the client must not work out for itself.
//
// The body is served verbatim rather than as HTML because that is the only form
// that stays useful: it is what an editor would save back, and it is what a
// markdown pipeline with its own plugins (task lists, mermaid, highlighting)
// needs as input. Shipping HTML as well would be two representations of the same
// thing on every request, and would put the body outside the component tree.
//
// What the client would otherwise have to reimplement travels as data instead:
//
//   - Links carries each link's raw on-disk form alongside its resolved bundle
//     path, so the client resolves a link by looking it up rather than by doing
//     path arithmetic against the bundle root. Only in-bundle links appear; an
//     external or out-of-bundle href is simply absent from the table, and the
//     client leaves anything it cannot find exactly as authored.
//   - Headings carries the id each heading must get. Every markdown library
//     brings its own slugger and they disagree in small ways, so generating them
//     client-side would silently break `#anchor` links the engine considers
//     valid.
type EntryView struct {
	Path        string         `json:"path"`
	Type        string         `json:"type"`
	Frontmatter map[string]any `json:"frontmatter"`
	Body        string         `json:"body"`
	Links       []LinkView     `json:"links"`
	Backlinks   []BacklinkView `json:"backlinks"`
	Headings    []HeadingView  `json:"headings"`
	Checkboxes  []CheckboxView `json:"checkboxes"`
}

// LinkView is one outgoing internal link. Raw is the lookup key: it is the href
// exactly as the markdown renderer will encounter it.
type LinkView struct {
	Raw    string `json:"raw"`
	To     string `json:"to"`     // resolved bundle path, e.g. /notes/b.md
	Anchor string `json:"anchor"` // the fragment without '#', "" if none
	Text   string `json:"text"`
	Line   int    `json:"line"`
	// Exists is false when the target names no entry. Not an error: per the
	// format a link may point at knowledge not yet written, so the reader shows
	// it differently rather than hiding or breaking it.
	Exists bool `json:"exists"`
}

type BacklinkView struct {
	From string `json:"from"`
	Text string `json:"text"`
	Line int    `json:"line"`
}

// Positions come in two coordinate systems, and both are sent because mixing
// them is a silent error.
//
// Line is the line in the *file*, counting frontmatter, which is what a write
// is addressed by. BodyLine is the line in the body as served, frontmatter
// stripped, which is what anything rendering that body can match against. They
// differ by the length of the frontmatter block, so a client that had only one
// would either fail to match every element or write to the wrong line.
type HeadingView struct {
	Level    int    `json:"level"`
	Text     string `json:"text"`
	ID       string `json:"id"`
	Line     int    `json:"line"`
	BodyLine int    `json:"bodyLine"`
}

type CheckboxView struct {
	Line     int    `json:"line"`
	BodyLine int    `json:"bodyLine"`
	Done     bool   `json:"done"`
	Text     string `json:"text"`
}

func (s *Server) handleEntry(w http.ResponseWriter, r *http.Request) {
	idx := s.store.Snapshot()

	// The request path is only ever a map key, never a file operation. Rooting it
	// keeps Resolve on its lookup branch (a bare name would trigger a basename
	// scan), so `..` and absolute paths are meaningless here rather than
	// dangerous: they simply match no entry.
	path := "/" + strings.TrimPrefix(r.PathValue("path"), "/")
	e, err := idx.Resolve(path)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody{err.Error()})
		return
	}

	body, err := e.Body()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody{err.Error()})
		return
	}

	// How many lines the frontmatter took, so file positions can be expressed in
	// body coordinates too. Derived from what was actually stripped rather than
	// by re-parsing the fence, so it cannot disagree with Body().
	raw, err := e.Raw()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody{err.Error()})
		return
	}
	offset := strings.Count(raw[:len(raw)-len(body)], "\n")

	view := EntryView{
		Path:        e.Path,
		Type:        e.Type,
		Frontmatter: e.Frontmatter(),
		Body:        body,
		Links:       outgoing(idx, e),
		Backlinks:   incoming(idx, e.Path),
		Headings:    headings(e, offset),
		Checkboxes:  checkboxes(e, offset),
	}
	writeJSON(w, http.StatusOK, view)
}

// outgoing builds the raw-to-resolved table from the entry's own links, which
// are the only place the on-disk spelling survives.
func outgoing(idx *index.Index, e *index.Entry) []LinkView {
	out := make([]LinkView, 0, len(e.Links))
	for _, l := range e.Links {
		_, err := idx.Resolve(l.Target)
		out = append(out, LinkView{
			Raw:    l.Raw,
			To:     l.Target,
			Anchor: l.Anchor,
			Text:   l.Text,
			Line:   l.Line,
			Exists: err == nil,
		})
	}
	return out
}

func incoming(idx *index.Index, path string) []BacklinkView {
	refs := idx.Backlinks(path)
	out := make([]BacklinkView, 0, len(refs))
	for _, r := range refs {
		out = append(out, BacklinkView{From: r.From, Text: r.Text, Line: r.Line})
	}
	return out
}

func headings(e *index.Entry, offset int) []HeadingView {
	texts := make([]string, len(e.Headings))
	for i, h := range e.Headings {
		texts[i] = h.Text
	}
	ids := slug.Headings(texts)

	out := make([]HeadingView, 0, len(e.Headings))
	for i, h := range e.Headings {
		out = append(out, HeadingView{Level: h.Level, Text: h.Text, ID: ids[i], Line: h.Line, BodyLine: h.Line - offset})
	}
	return out
}

func checkboxes(e *index.Entry, offset int) []CheckboxView {
	out := make([]CheckboxView, 0, len(e.Checkboxes))
	for _, c := range e.Checkboxes {
		out = append(out, CheckboxView{Line: c.Line, BodyLine: c.Line - offset, Done: c.Done, Text: c.Text})
	}
	return out
}
