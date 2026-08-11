# Changelog

All notable changes to `wikiview` are documented here. This project follows [semantic versioning](https://semver.org); while pre-1.0, breaking changes bump the minor version.

## v0.1.0 — 2026-08-11

First release. `wikiview --root my-kb` serves a folder of markdown at `http://localhost:8080`, and you can read it.

### New

- Browse the tree, follow links between entries, and jump to headings. A folder opens its `index.md`, or gets a generated listing if it has none. Nothing is written to the bundle to make a folder look tidier.

- Ticking a `- [ ]` edits the file, through the engine's write API: one character changes, atomically, and the entry re-parses itself. It is the only thing here that writes.

  Writes carry the version their data was read at. A checkbox is addressed by line number, and that number only means something against the content it came from, so if the entry changed underneath, the write is refused with the current version instead of landing on whatever now sits on that line.

- A watcher keeps the index in step with the files, so an agent or an editor working on the same folder shows up without anything asking. A batch of filesystem events counts as one change: a single save is several events and a `tidy --all` is hundreds, and rebuilding per event would rebuild the bundle dozens of times over.

  Clients hear a version number over server-sent events, never a payload, and refetch whatever they are looking at. One that missed ten events pulls once and is correct again, which means no replay to design and no ordering to get wrong. The version only moves when content really changed, so a save that edited nothing does not churn every open tab.

- Real routes. `/wiki/notes/design.md` is the bundle path verbatim, `.md` and all, and it survives a refresh or a pasted link. Hash routing was not available: the fragment carries heading anchors.

- Light, dark and system themes, applied before the first paint so a stored preference does not flash the wrong one.

### Design notes

The server resolves the engine's rules and sends the answers as data; the client renders. Two things a browser must not work out for itself: resolving a relative link like `./b.md` against the bundle root, and deciding what id a heading gets. Every markdown library brings its own slugger, and they disagree in small ways. goldmark turns `and_underscore` into `and-underscore`; the engine keeps the underscore, matching GitHub. A near-match is the worst case, because `wiki check` calls the anchor valid while the page silently fails to scroll to it.

Both travel as lookup tables beside the body, so the client resolves by lookup rather than by arithmetic. An href missing from the table, external or climbing out of the bundle, is left exactly as written.

The body is served as markdown. That is the form an editor saves back and the form a plugin pipeline wants as input, and it keeps the content inside the component tree where task lists and diagrams can be components.

One index, rebuilt on change, with no view privileged in the store. A reader takes a snapshot and reads it lock-free, so a request that began before a rebuild still finishes against consistent data. A failed rebuild leaves the previous index serving: an entry saved mid-edit with broken frontmatter should not take the server down.

A request path is only ever a map key, never a file operation. Traversal is not blocked so much as meaningless, since there is no such key. Percent-encoded traversal reaches the handler intact, because Go's router cleans a literal `..` but not `%2e%2e`, and it misses for the only reason that matters.

Raw HTML in an entry is not rendered, and link destinations are limited to `http`, `https` and `mailto`. These files are written by agents and by anyone else with access to the folder, so rendering their HTML would make every entry author an author of the UI.

Configuration lives in the bundle's own `wiki.toml` under `[tool.wikiview]`, read through `bundle.DecodeTool`. No satellite config file, no second TOML parser, and all of it optional.

### Known limitations

- Boards, dataset grids and git actions are not built. The reader came first on purpose: a reader built on top of a board inherits the board's shape, and that is not something you undo later.
- Nothing edits prose. The API serves what an editor would need and the layout leaves room for one, but no markdown is editable yet.
- The watcher's timing tests are skipped on Windows. They assert on event counts inside a time window, which depends on how the filesystem batches and delivers notifications. Clean shutdown is still covered there.
- The frontend bundle is about 570 KB, roughly a third of it syntax highlighting. Going below the 37 common grammars means building a highlighter instance by hand, which is worth doing once that number starts to matter.

### Requires

`wiki` v0.9.0 or later.
