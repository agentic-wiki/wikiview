package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
)

// idPattern is what an id may look like: a word, lowercase, no slashes.
//
// A slash would put it back in competition with the folder names it sits among,
// and the whole point of an id is that the first segment of `/kanban/<id>/...`
// reads one way. The rest is so an id survives being typed, pasted and read back
// out of a URL unchanged.
var idPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]*$`)

// Declare appends a board to the bundle's wiki.toml.
//
// Appended, never rewritten. This file is the user's and `wiki` reads it too: it
// holds comments, its own formatting, and keys this package has never heard of,
// none of which survives a parse-and-reserialize. Adding a table to the end is
// the whole edit, which is small enough to be obviously correct.
//
// Only the keys that say which board this is. `where`, `status` and `columns`
// all have defaults, and writing them out would be a config file full of
// settings nobody chose.
func Declare(dir string, existing Config, b Board) error {
	if err := validate(existing, b); err != nil {
		return err
	}

	path := filepath.Join(dir, "wiki.toml")
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var out strings.Builder
	out.Write(raw)
	if len(raw) > 0 && !strings.HasSuffix(string(raw), "\n") {
		out.WriteString("\n")
	}
	out.WriteString("\n[[tool.wikiview.board]]\n")
	fmt.Fprintf(&out, "id   = %s\n", quote(b.ID))
	fmt.Fprintf(&out, "path = %s\n", quote(b.Path))
	if b.Name != "" {
		fmt.Fprintf(&out, "name = %s\n", quote(b.Name))
	}

	return replace(path, out.String())
}

// validate reports what would make the board unaddressable or the file wrong.
func validate(existing Config, b Board) error {
	if !idPattern.MatchString(b.ID) {
		return errors.New("an id is a word: lowercase letters, digits, '-' and '_', starting with a letter or digit")
	}
	for _, other := range existing.Board {
		if other.ID == b.ID {
			return fmt.Errorf("a board with the id %q is already declared", b.ID)
		}
	}
	if !strings.HasPrefix(b.Path, "/") {
		return errors.New("a board path starts at the bundle root, like /backlog")
	}
	if !writable(b.Path) {
		return errors.New("that path cannot be written to wiki.toml")
	}
	if !writable(b.Name) {
		return errors.New("that name cannot be written to wiki.toml")
	}
	return nil
}

// writable reports whether a string can go in a TOML basic string with only the
// two escapes below.
//
// Refusing the rest rather than escaping it. A control character in a board name
// is a paste accident or an attempt to write something else into the file, and
// neither is worth carrying an escape table for.
func writable(s string) bool {
	for _, r := range s {
		// ReplacementChar is what ranging over invalid UTF-8 yields, so this
		// catches bytes that are not text at all as well as the ones that are.
		if unicode.IsControl(r) || r == unicode.ReplacementChar {
			return false
		}
	}
	return true
}

// quote renders a validated string as a TOML basic string.
func quote(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`)
	return `"` + r.Replace(s) + `"`
}

// replace writes content over path atomically, keeping the file's permissions.
//
// A rename rather than a truncate-and-write, so a reader — `wiki`, an editor,
// this server's own watcher — never sees a half-written config. Losing the
// user's config to a crash mid-write is not a trade worth making to save a
// temporary file.
func replace(path, content string) error {
	dir := filepath.Dir(path)
	perm := os.FileMode(0o644)
	if fi, err := os.Stat(path); err == nil {
		perm = fi.Mode().Perm()
	}

	tmp, err := os.CreateTemp(dir, ".wiki.toml-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())

	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), perm); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
