package server

import (
	"net/http"
	path2 "path"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

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
	Path string `json:"path"`
	// Title is the entry's own title, or a readable name from its filename — the
	// same rule the tree and a backlink use, so an entry is never called two
	// different things depending on where you see it named.
	Title       string         `json:"title"`
	Type        string         `json:"type"`
	Frontmatter map[string]any `json:"frontmatter"`
	Body        string         `json:"body"`
	Links       []LinkView     `json:"links"`
	// FrontmatterRefs are frontmatter values that name an entry in this bundle.
	// Keyed by field and value so a client can look one up without deciding for
	// itself what looks like a path.
	FrontmatterRefs []RefView      `json:"frontmatterRefs"`
	Backlinks       []BacklinkView `json:"backlinks"`
	Headings        []HeadingView  `json:"headings"`
	Checkboxes      []CheckboxView `json:"checkboxes"`
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
	// Outside marks a link that resolves above the bundle root. To is empty for
	// these: there is no bundle path, because the target is not in the bundle.
	//
	// They are reported rather than omitted so the client does not have to infer
	// what an unknown href means. Left out, a renderer emits a plain anchor with
	// the relative href, the browser resolves it against the current route, and
	// clicking it triggers a full page load into an address the app does not
	// serve. Knowing it is outside means it can be shown as what it is.
	Outside bool `json:"outside"`
}

// RefView is one frontmatter value that resolves to an entry.
//
// Which fields these are is not configured or guessed at: any value naming an
// entry is one. `blockers` and `epic` are conventions, not rules, and a bundle
// is free to invent `supersedes` or `source` — hardcoding a list would make
// those inert for no reason.
//
// The .md suffix gates the test, matching what `move --include-frontmatter`
// does upstream: without it an arbitrary string like `title: Some Note` would
// resolve against the bundle root and become a link by accident.
type RefView struct {
	Key   string `json:"key"`
	Value string `json:"value"` // exactly as written, the lookup key
	To    string `json:"to"`    // resolved bundle path
	// Label is the target's filename made readable, matching what the tree and
	// the breadcrumb call it. A reference names a file you can navigate to, and
	// an entry answering to two different names depending on where you met it
	// is the thing that makes a bundle hard to hold in your head.
	Label string `json:"label"`
}

// BacklinkView is one link pointing at this entry.
//
// Title is the *linking* entry's own title, which is what identifies the source
// to a reader. Text is the words that entry used for the link, which is a
// different thing entirely: showing it alone reads as this page's name, because
// a link is usually labelled with the name of its target.
type BacklinkView struct {
	From  string `json:"from"`
	Title string `json:"title"`
	Text  string `json:"text"`
	Line  int    `json:"line"`
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
	idx := s.store.View().Index

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

	title := e.Field("title")
	if title == "" {
		title = titleFromFilename(e.Path)
	}

	view := EntryView{
		Path:            e.Path,
		Title:           title,
		Type:            e.Type,
		Frontmatter:     e.Frontmatter(),
		Body:            body,
		Links:           outgoing(idx, e),
		FrontmatterRefs: frontmatterRefs(idx, e),
		Backlinks:       incoming(idx, e.Path),
		Headings:        headings(e, offset),
		Checkboxes:      checkboxes(e, offset),
	}
	writeJSON(w, http.StatusOK, view)
}

// outgoing builds the raw-to-resolved table from the entry's own links, which
// are the only place the on-disk spelling survives.
func outgoing(idx *index.Index, e *index.Entry) []LinkView {
	out := make([]LinkView, 0, len(e.Links)+len(e.Outside))
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
	// Links climbing above the bundle root. The engine keeps these separate from
	// the graph because they are neither an edge nor broken; the reader needs
	// them so it can decline to make them navigable.
	for _, l := range e.Outside {
		out = append(out, LinkView{
			Raw:     l.Raw,
			Text:    l.Text,
			Line:    l.Line,
			Outside: true,
		})
	}
	return out
}

// frontmatterRefs finds every frontmatter value that names an entry.
//
// Scalars and lists are treated the same, because the format makes no
// distinction: `epic: /epics/x.md` and `blockers: [/a.md, /b.md]` are the same
// kind of reference, one of them repeated. FieldList normalizes a lone scalar
// into a one-element list, which is the same rule matching uses, so this agrees
// with `--where` rather than being subtly different.
//
// Only values that resolve are returned. An unresolved one is left to render as
// ordinary text: a frontmatter field is not a link by nature, and marking every
// .md-ish string as broken would put warnings on data that is merely a string.
func frontmatterRefs(idx *index.Index, e *index.Entry) []RefView {
	out := []RefView{}
	for key := range e.Frontmatter() {
		if strings.HasPrefix(key, "_") {
			continue // the index's namespace, not the author's
		}
		for _, value := range e.FieldList(key) {
			if !strings.HasSuffix(value, ".md") {
				continue
			}
			target, outside := idx.ResolveLink(e.Path, value)
			if outside {
				continue
			}
			if _, err := idx.Resolve(target); err != nil {
				continue // names no entry: ordinary text
			}
			out = append(out, RefView{Key: key, Value: value, To: target, Label: titleFromFilename(target)})
		}
	}
	// Sorted, so the same entry always produces the same response rather than one
	// whose order depends on map iteration.
	slices.SortFunc(out, func(a, b RefView) int {
		if a.Key != b.Key {
			return strings.Compare(a.Key, b.Key)
		}
		return strings.Compare(a.Value, b.Value)
	})
	return out
}

func incoming(idx *index.Index, path string) []BacklinkView {
	refs := idx.Backlinks(path)
	out := make([]BacklinkView, 0, len(refs))
	for _, r := range refs {
		// The source entry's own title, falling back to its filename. A reader
		// needs to know *which entry* mentions this one, and the link text does
		// not say that.
		title := ""
		if src, err := idx.Resolve(r.From); err == nil {
			title = src.Field("title")
		}
		if title == "" {
			title = titleFromFilename(r.From)
		}
		out = append(out, BacklinkView{From: r.From, Title: title, Text: r.Text, Line: r.Line})
	}
	return out
}

// titleFromFilename makes a readable name out of a path.
//
// Filenames in this format are slugs by convention, since `tidy --slug`
// enforces it, and they often carry a leading number. So separators become
// spaces and the name is capitalized: "003-watch-and-events.md" reads as
// "003 Watch and events".
//
// The number stays. It is why the file is called what it is: it orders the
// folder, and a reader that dropped it would sort its tree one way while
// showing names that explain a different order. Removing information a person
// deliberately put in a filename is not this function's business.
func titleFromFilename(p string) string {
	name := strings.TrimSuffix(path2.Base(p), ".md")
	name = strings.ReplaceAll(strings.ReplaceAll(name, "-", " "), "_", " ")
	name = strings.TrimSpace(name)
	if name == "" {
		return path2.Base(p)
	}

	// Capitalized, because this name is generated: a filename is lowercase by
	// convention and reads as a filename until something makes it a sentence.
	// An entry's *own* title is never touched — that is the author's text, and
	// "correcting" it would be this reader having an opinion about their prose.
	//
	// The first word that begins with a letter, not simply the first character:
	// a leading number has no case, and "001 what to pick" wants the w. Nor any
	// letter anywhere, which would reach inside a word and make "2024review"
	// into "2024Review".
	//
	// Decoding a rune rather than indexing a byte: name[:1] of "élan" is half a
	// character, and uppercasing that fragment produces mojibake.
	offset := 0
	for _, word := range strings.Split(name, " ") {
		if r, size := utf8.DecodeRuneInString(word); unicode.IsLetter(r) {
			return name[:offset] + string(unicode.ToUpper(r)) + name[offset+size:]
		}
		offset += len(word) + 1
	}
	return name // no word starts with a letter: all digits, or a script without case
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
