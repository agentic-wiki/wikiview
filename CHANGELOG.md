# Changelog

All notable changes to `wikiview` are documented here. This project follows [semantic versioning](https://semver.org); while pre-1.0, breaking changes bump the minor version.

## v0.2.0 — 2026-08-11

### Breaking

- The bundle path is a positional argument instead of `--root`, since there is only one thing to point this at.

  ```sh
  wikiview my-kb
  ```

  Flags may sit on either side of it. Go's flag package stops at the first non-flag argument, which would have made `wikiview my-kb --port 3000` serve on 8080 without saying so.

- `--addr` is replaced by `--host` and `--port`. They are two separate decisions: which machines can reach the server, and which port it answers on.

  ```sh
  wikiview --host 0.0.0.0 --port 3000
  ```

  Binding to anything but a loopback interface now says so on startup. wikiview has no authentication and writes to the bundle, so anyone who can reach it can read every entry and tick boxes in them.

### Changed

- Navigation names files rather than titles. The tree, the breadcrumb, a folder listing and a frontmatter reference all show the filename made readable, so `/2-server/001-what-to-pick.md` reads as "2 Server" and "001 What to pick". You navigated to a file, so the tree names the file. What an entry calls itself appears on the entry, and search matches either name.

### Fixed

- Going back returns to where you were. The view no longer blanks while an entry loads, so the container keeps its height and there is somewhere to put the old position. Coming back to a long entry from a short one retries until the incoming content is tall enough, rather than settling for the short one's maximum.

### New

- Files a bundle carries but does not index are served at `/raw/…`. An image in an entry displays, and a link to a contract or a spreadsheet beside the notes about it opens in a new tab instead of a page that does not exist.

  Entries are served there too, as the bytes on disk. `/api/entry` hands back a parsed entry, body separated from frontmatter, and you cannot rebuild the file from that, so `/raw/notes/a.md` is what a backup or a diff should read.

  Only paths the index refers to are servable, so a request stays a map lookup rather than a file search. A `.env` sitting next to your notes has no key and cannot be asked for.

  Content types are declared and never sniffed. `.html` downloads rather than displays, since an entry's HTML is deliberately not rendered and serving it from this origin would undo that. SVG displays, under a policy that blocks script and sandboxes the document: a diagram works, and a script inside one cannot reach the API.

- The tree remembers which folders you left open, scoped per bundle, so five knowledge bases in one browser keep their preferences apart.

- Entries that changed since you last opened them are marked in the tree, in the search palette, and on the folders above them. An agent editing the bundle while you read it no longer does so silently.

  Each entry reports the bundle version its content last moved at, so this is one comparison per entry rather than a diff of two trees, and a client that missed ten events still gets the right answer from the eleventh. Which entries you have seen is one person's attention in one browser, and it stays there rather than being written into the files.

  Arriving for the first time marks nothing. It means *changed since you were here*, not *unread*.

## v0.1.0 — 2026-08-11

First release. Serves the bundle you point it at, or the current folder, and you read it in a browser at `http://localhost:8080`.

### New

- Browse the tree, follow links between entries, and jump to headings. A folder opens its `index.md`, or gets a generated listing if it has none. Nothing is written to the bundle to make a folder look tidier.

- Ticking a `- [ ]` edits the file through the engine's write API: one character, written atomically, and the entry re-parses itself. The only write in the program.

  Writes carry the version their data was read at. A checkbox is addressed by line number, and a line number only means something against the content it came from. If the entry changed underneath, the write is refused and comes back with the current version rather than landing on whatever now sits on that line.

- A watcher keeps the index in step with the files, so an agent or an editor working on the same folder shows up without anything asking. A batch of filesystem events counts as one change: a single save is several events and a `tidy --all` is hundreds, and rebuilding per event would rebuild the bundle dozens of times over.

  Clients hear a version number over server-sent events, never a payload, and refetch whatever they are looking at. One that missed ten events pulls once and is correct again, which means no replay to design and no ordering to get wrong. The version only moves when content really changed, so a save that edited nothing does not churn every open tab.

- Routes are real paths. `/wiki/notes/design.md` is the bundle path verbatim, `.md` and all, and it survives a refresh or a pasted link. Hash routing was unavailable, since the fragment carries heading anchors.

- Light, dark and system themes, applied before the first paint so a stored preference does not flash the wrong one.

### Design notes

The server resolves the engine's rules and sends the answers as data; the client renders. Two things a browser must not work out for itself: resolving a relative link like `./b.md` against the bundle root, and deciding what id a heading gets. Every markdown library brings its own slugger, and they disagree in small ways. goldmark turns `and_underscore` into `and-underscore`; the engine keeps the underscore, matching GitHub. A near-match is the worst case, because `wiki check` calls the anchor valid while the page silently fails to scroll to it.

Both travel as lookup tables beside the body, so the client resolves by lookup rather than by arithmetic. An href missing from the table, external or climbing out of the bundle, is left exactly as written.

The body is served as markdown. That is the form an editor saves back and the form a plugin pipeline wants as input, and it keeps the content inside the component tree where task lists and diagrams can be components.

One index, rebuilt on change, with no view privileged in the store. A reader takes a snapshot and reads it lock-free, so a request that began before a rebuild still finishes against consistent data. A failed rebuild leaves the previous index serving: an entry saved mid-edit with broken frontmatter should not take the server down.

A request path is only ever a map key, never a file operation. Traversal is not blocked so much as meaningless, since there is no such key. Percent-encoded traversal does reach the handler intact, because Go's router cleans a literal `..` but not `%2e%2e`, and it misses the lookup like any other wrong path.

Raw HTML in an entry is not rendered, and link destinations are limited to `http`, `https` and `mailto`. These files are written by agents and by anyone else with access to the folder, so rendering their HTML would make every entry author an author of the UI.

Configuration lives in the bundle's own `wiki.toml` under `[tool.wikiview]`, read through `bundle.DecodeTool`. No satellite config file, no second TOML parser, and all of it optional.

### Known limitations

- Boards, dataset grids and git actions are not built. The reader came first on purpose, because a reader built on top of a board inherits the board's shape and stays that way.
- Nothing edits prose. The API serves what an editor would need and the layout leaves room for one, but no markdown is editable yet.
- The watcher's timing tests are skipped on Windows. They assert on event counts inside a time window, which depends on how the filesystem batches and delivers notifications. Clean shutdown is still covered there.
- The frontend bundle is about 570 KB, roughly a third of it syntax highlighting. Going below the 37 common grammars means building a highlighter instance by hand, which is worth doing once that number starts to matter.
