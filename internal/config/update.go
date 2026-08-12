package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Settings are the keys a board's own settings own.
//
// A fixed set rather than an arbitrary map, because this is what the editor
// offers and every key here has a rule. `id` and `path` are not among them: they
// are what the board *is*, and changing an id silently breaks every link to it.
type Settings struct {
	Name    string   `json:"name"`
	Status  string   `json:"status"`
	Lane    string   `json:"lane"`
	Where   []string `json:"where"`
	Columns []string `json:"columns"`
}

// settingKeys is the order new keys are appended in, so a table this has edited
// reads the same way as one written by hand.
var settingKeys = []string{"name", "where", "status", "columns", "lane"}

// Update rewrites a board's settings in the bundle's wiki.toml, in place.
//
// Every other byte of the file is left alone: comments, other tools' tables, and
// whatever formatting the user chose. Only the lines for the keys above change,
// and a key set to nothing is removed rather than written empty — `lane = ""` is
// a lane called "", which is not what "no lanes" means.
//
// The board must already be declared, with one exception: `root` exists without
// any config, so settings for it declare it. That is the one id a bundle has
// without asking, and refusing to configure the board somebody is looking at
// would be a dead end.
func Update(dir, id string, s Settings) error {
	if err := validSettings(s); err != nil {
		return err
	}

	path := filepath.Join(dir, "wiki.toml")
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	lines := strings.Split(string(raw), "\n")
	span, ok := boardTable(lines, id)
	if !ok {
		if id != RootID {
			return fmt.Errorf("no board with the id %q is declared", id)
		}
		return declareRoot(path, string(raw), s)
	}
	edited, err := applySettings(lines, span, s)
	if err != nil {
		return err
	}
	return replace(path, strings.Join(edited, "\n"))
}

// span is a half-open range of lines: the body of one table, header excluded.
type span struct{ from, to int }

// boardTable finds the body of the `[[tool.wikiview.board]]` table declaring id.
//
// Line-based rather than parsed, because parsing is the thing that loses the
// file. A table's body runs from its header to the next one, which is what makes
// "leave every other byte alone" something this can actually promise.
func boardTable(lines []string, id string) (span, bool) {
	want := quote(id)
	for i, line := range lines {
		if strings.TrimSpace(line) != "[[tool.wikiview.board]]" {
			continue
		}
		body := span{from: i + 1, to: len(lines)}
		for j := i + 1; j < len(lines); j++ {
			if strings.HasPrefix(strings.TrimSpace(lines[j]), "[") {
				body.to = j
				break
			}
		}
		for j := body.from; j < body.to; j++ {
			if key, value, ok := keyValue(lines[j]); ok && key == "id" && value == want {
				return body, true
			}
		}
	}
	return span{}, false
}

// keyValue splits a `key = value` line, reporting whether it is one.
//
// Comments and blank lines are not, and neither is anything whose value does not
// finish on its line — a multi-line array or string. Those are refused rather
// than guessed at, because a line-based edit around them would move a bracket
// into the wrong table.
func keyValue(line string) (key, value string, ok bool) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return "", "", false
	}
	key, value, found := strings.Cut(trimmed, "=")
	if !found {
		return "", "", false
	}
	return strings.TrimSpace(key), strings.TrimSpace(value), true
}

// complete reports whether a value finishes on its own line.
func complete(value string) bool {
	depth, quoted, escaped := 0, false, false
	for _, r := range value {
		switch {
		case escaped:
			escaped = false
		case quoted && r == '\\':
			escaped = true
		case r == '"':
			quoted = !quoted
		case quoted:
		case r == '[':
			depth++
		case r == ']':
			depth--
		case r == '#':
			return depth == 0 // a trailing comment, and nothing left open
		}
	}
	return depth == 0 && !quoted
}

// applySettings replaces, adds and removes the setting lines inside one table.
func applySettings(lines []string, body span, s Settings) ([]string, error) {
	values := map[string]string{
		"name":    optional(s.Name),
		"status":  optional(s.Status),
		"lane":    optional(s.Lane),
		"where":   list(s.Where),
		"columns": list(s.Columns),
	}

	kept := make([]string, 0, body.to-body.from)
	written := map[string]bool{}
	for _, line := range lines[body.from:body.to] {
		key, value, ok := keyValue(line)
		if !ok {
			kept = append(kept, line) // a comment or a blank line, untouched
			continue
		}
		if !complete(value) {
			return nil, fmt.Errorf(
				"the board's %q spans more than one line, so wiki.toml has to be edited by hand", key)
		}
		next, mine := values[key]
		if !mine {
			kept = append(kept, line) // `id`, `path`, or a key nobody here knows
			continue
		}
		written[key] = true
		if next != "" {
			// The key's own spacing, so a table lined up by hand stays lined up.
			kept = append(kept, line[:strings.Index(line, "=")]+"= "+next)
		}
	}

	// Anything not already in the table goes after what is, in a settled order so
	// two boards edited here do not read differently.
	at := alignment(lines[body.from:body.to])
	added := make([]string, 0, len(settingKeys))
	for _, key := range settingKeys {
		if !written[key] && values[key] != "" {
			added = append(added, pad(key, at)+"= "+values[key])
		}
	}
	kept = insertBeforeTrailingBlanks(kept, added)

	out := make([]string, 0, len(lines)+len(added))
	out = append(out, lines[:body.from]...)
	out = append(out, kept...)
	return append(out, lines[body.to:]...), nil
}

// alignment is where a table's `=` signs line up, or 0 when they do not.
//
// Writing ragged keys into a table somebody lined up by hand is a way of
// disturbing the file, which is the one thing this writer is for not doing. Only
// what the table already does: a table with no alignment gets none invented.
func alignment(body []string) int {
	at := 0
	for _, line := range body {
		key, _, ok := keyValue(line)
		if !ok {
			continue
		}
		if column := strings.Index(line, "="); column > len(key)+1 && column > at {
			at = column
		}
	}
	return at
}

// pad puts a key in a field `at` characters wide, or leaves one space after it.
func pad(key string, at int) string {
	if at <= len(key) {
		return key + " "
	}
	return key + strings.Repeat(" ", at-len(key))
}

// insertBeforeTrailingBlanks puts new lines at the end of a table's body but
// above the blank line separating it from whatever comes next.
func insertBeforeTrailingBlanks(body, add []string) []string {
	if len(add) == 0 {
		return body
	}
	at := len(body)
	for at > 0 && strings.TrimSpace(body[at-1]) == "" {
		at--
	}
	return append(body[:at:at], append(add, body[at:]...)...)
}

// declareRoot writes the board every bundle has but nothing declares, so its
// settings have somewhere to live.
func declareRoot(path, raw string, s Settings) error {
	var out strings.Builder
	out.WriteString(raw)
	if raw != "" && !strings.HasSuffix(raw, "\n") {
		out.WriteString("\n")
	}
	out.WriteString("\n[[tool.wikiview.board]]\n")
	fmt.Fprintf(&out, "id   = %s\n", quote(RootID))
	fmt.Fprintf(&out, "path = %s\n", quote("/"))
	for _, key := range settingKeys {
		switch key {
		case "name":
			writeIf(&out, key, optional(s.Name))
		case "status":
			writeIf(&out, key, optional(s.Status))
		case "lane":
			writeIf(&out, key, optional(s.Lane))
		case "where":
			writeIf(&out, key, list(s.Where))
		case "columns":
			writeIf(&out, key, list(s.Columns))
		}
	}
	return replace(path, out.String())
}

func writeIf(out *strings.Builder, key, value string) {
	if value != "" {
		fmt.Fprintf(out, "%s = %s\n", key, value)
	}
}

// optional renders a string setting, or "" for one that should not be written.
func optional(s string) string {
	if s == "" {
		return ""
	}
	return quote(s)
}

// list renders a string array, or "" for one that should not be written.
//
// An empty array is not written either: `columns = []` says the same thing as
// leaving it out, and the shorter one is the one somebody reading the file has
// to understand.
func list(values []string) string {
	if len(values) == 0 {
		return ""
	}
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = quote(v)
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}

// validSettings refuses what cannot be written as a TOML basic string. Whether a
// `where` expression parses is the caller's to check, with the engine's parser.
func validSettings(s Settings) error {
	for _, v := range append([]string{s.Name, s.Status, s.Lane}, append(s.Where, s.Columns...)...) {
		if !writable(v) {
			return errors.New("a setting holds a character that cannot be written to wiki.toml")
		}
	}
	return nil
}
