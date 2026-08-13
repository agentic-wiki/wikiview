# Changelog

All notable changes to `wikiview` are documented here. This project follows [semantic versioning](https://semver.org); while pre-1.0, breaking changes bump the minor version.

## v0.4.0 — 2026-08-13

### New

- **Refresh, pull and sync, from the header.** The first things wikiview does that reach outside the machine, so pull and sync show what they will do and act on confirmation. Refresh does not: it re-reads the disk, reaches nothing and undoes nothing.

  `GET /api/git` costs no network. It reads the branch, the upstream, ahead and behind as of the last fetch, and everything a commit would carry. The one read that reaches out happens when you open the pull preview, because asking to see what a pull would do is asking.

  **A pull that fails leaves nothing behind.** The rebase is aborted, the tree is restored exactly as it was, and the answer carries the way out with the problem: a proposed branch name to push your local work to, so the conflict gets resolved with a real tool on a real checkout instead of in a browser tab.

  Everything is scoped to the bundle, which can be a subdirectory of a larger repository. If files are staged elsewhere in that repository, the preview says how many and that they will be left alone.

  The commit message is proposed from what changed: the path when one file moved, a count and their shared folder when several did. A sync with nothing to commit asks for no message at all and says "Push", since a bundle whose commits were made in a terminal has nothing to say about a commit that is not happening.

  **Signing is never dropped to make a commit succeed.** Someone who set `commit.gpgsign` decided their commits are signed; quietly producing unsigned ones would put a hole in that record they did not ask for and would not notice. The commit fails, and the message names signing rather than leaving "Couldn't get agent socket" to be interpreted.

  Git is optional throughout. A bundle is a folder first: no repository or no `git` binary means the actions are absent rather than broken.

- **Printing.** A stylesheet rather than a feature, since every browser already makes PDFs and everyone knows ⌘P. What was missing was a page worth printing: the shell is a full-height flex layout whose view area scrolls itself, so a long entry used to print as one page showing whatever happened to be on screen.

  A board prints as what it says rather than what it looks like: a section per column with its cards listed under it, because a board is horizontal and paper is not. A card open over a board prints as the card, and the board behind it stands down. Controls are gone, dark themes print as ink, and external links grow their URL while internal ones do not: the bundle path is recoverable from the text, the URL is not.

  A print button floats at the top right of an entry, over a gradient so it never lands on top of a word.

- **Cards show their tags**, capped at three with the rest counted, so a card stays a glance rather than becoming a tag cloud.

### Changed

- **Light and dark both have depth.** Three surface tones per theme rather than one background with hairlines drawn on it: a ground, a page, and anything raised off it. A board reads as columns on a canvas before any shadow is involved, which is what matters in dark mode where a shadow is nearly invisible.

- **The accent colour does something.** It is indigo, deliberately not amber or red, because those mean warning and failure by a convention nobody is going to unlearn and an identity colour in either family competes with them exactly when something has gone wrong. It marks keyboard focus, links in prose, the active rail section, and the drop target under a dragged card. Warnings and failures have their own colours now, instead of four spellings scattered across four files.

- Capitals are set as capitals. Uppercase letterforms are all one height, so at the tracking that suits lowercase they read as a wall: the bundle name, column headers and lane headers are spaced for it.

- Syntax highlighting has a lightness per theme instead of one mid-tone meant for both.

## v0.3.0 — 2026-08-12

### New

- **Kanban boards.** Every bundle has one at `/kanban/root` without configuring anything: the whole bundle, as columns of the tasks in it. Cards come from `type: task` entries and the columns from their `status`.

  Boards beyond that are declared in the bundle's own `wiki.toml`:

  ```toml
  [[tool.wikiview.board]]
  id   = "backlog"
  path = "/backlog"
  ```

  The `id` is the board's address, at `/kanban/backlog`. It is written rather than derived from the path, which is what lets a card live in the address too: `/kanban/backlog/backlog/design.md` splits at the first segment and everything after it is a bundle path. Two boards can sit over one folder, which is the reason ids exist at all: everything and just bugs, or the same tasks grouped two ways.

  A card opens as a dialog over the board rather than navigating away from it, so the columns stay in view. It is a route, so back closes it and a link to it reopens the same thing. A link inside a card that points at another card on the same board opens that card; anything else leaves for the reader.

  Columns come from the entries, and config orders them and adds the ones that are still empty. A status present in the entries but missing from `columns` still gets a column: config orders and adds, and never filters, because filtering is `where`'s job where it is visible.

- **Dragging a card moves it by column and by lane at once.** One diagonal drag resolves both, so a card can be sent to another status and another lane in one gesture, and both fields are written in one pass: a board with lanes cannot end up with a card in its new column and its old lane.

  Every lane appears in every column, including the ones with nothing in them, because a lane is a row. Derived per column instead, there would be nowhere to drop a card into a lane that column had not used yet.

  Pointer events rather than HTML5 drag-and-drop, which never fires for touch. On touch a press-and-hold starts the drag and a press that moves first scrolls the board, so a long column is still reachable with a finger. Dragging towards the edge of the board scrolls it, or a column off the side could not be dropped into at all. The click a gesture synthesizes afterwards is swallowed, so finishing a drag does not also open what was dragged.

  The move carries the version the board was read at, so a board somebody else changed underneath refuses the write and puts the card back rather than leaving the screen claiming something the file does not say.

- **Cards say what they are waiting on and what is waiting on them.** Two badges, because they are opposite facts: being blocked is a reason not to start and blocking others is a reason to, and one mark would have said neither. Counts rather than verdicts, since nothing here knows which of your status values mean finished.

  The field is `blockers` by default and configurable per board, because it is a workflow convention rather than part of the format. Counted across the whole bundle rather than the board, so "this is holding up three things" is true wherever those three live, and a blocker naming an entry nobody has written yet counts too.

- **Boards can be created and configured from the UI.** With none declared, the Boards panel offers a folder to pick and writes the config for you. A board's settings dialog edits its name, filter, status field, lane field and columns.

  Both write `wiki.toml` line by line and never reserialize it, so comments, other tools' tables and your formatting survive. A value written across several lines is reported rather than edited around.

  The filter is rows rather than syntax: a key, `is`/`is not`, and a value. Keys come from the frontmatter the folder actually uses, so choosing one is picking rather than recalling whether this bundle says `status` or `state`. Values are typed with those keys' values as suggestions, since a filter is often written before the entries catch up.

  A setting that cannot mean anything is refused rather than written: an id that is not a word or is already taken, a folder with no cards under it, a filter that does not parse, and a list-valued field as a column or lane, which is one value where a list has many.

- **Entries already read are kept for the session**, so returning to one renders it in the same frame as the navigation with no request at all. Each entry reports the version its content last moved at, so a copy taken later than that *is* the file rather than probably being it, and there is no timeout anywhere.

  Per entry rather than per bundle, which is what makes it hold up while an agent edits: something else changing no longer refetches what you are reading.

### Changed

- The icon rail does two things, decided separately: an icon you are not on takes you there, and the icon you are on opens or closes its panel. The panel's width is remembered per section, so the tree keeps its width beside what you are reading while a list of one board does not spend any.

### Fixed

- The server could crash with `concurrent map writes` while a board was open and the tree refetched beside it. The engine's TOML decoder records what it has read as it goes, so it writes to what it reads from, and two requests decoding one bundle at the same moment is a fatal race. Decoding is serialised now, and the race detector runs in the quality gate that missed it.

- Editing `wiki.toml` while the server was running reached nobody. The change was detected and the index rebuilt, but the version never moved, so no browser was told and the new board appeared only for whoever reloaded next.

- Every version announced now says why it moved. A deleted entry has nothing pointing at it, so a version that moved because of one used to report `no entry content moved` while the bundle was visibly changing. Deletions and config edits are named, and a version with no nameable reason says so.

- Rebuilding and announcing are one step. Taken apart, two overlapping rebuilds each read the version after both had landed, so one was announced twice and the one between it never at all.

- A board whose filter matched nothing rendered a blank page. It says what is missing instead, and offers a board over a folder that does have tasks in it.

- Switching between the reader and a board no longer plays an empty panel collapsing before the view arrives. The router defers navigation while a state update here was immediate, so the panel moved a frame early and the entry you were still reading reflowed into the new width.

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

- On Windows the bundle name read as the whole path to it. The rule that makes a filename readable is right for bundle paths, which use `/` on every machine, and wrong for the folder the bundle lives in, which uses whatever the OS does.

- A backlink from a folder's `index.md` says which folder: "1 Design (index)" rather than "Index", which every folder has one of. The tree and the breadcrumb still say "Index", because there the folder is already on screen.

- The icon rail expands when you hover the icons, not when the pointer crosses the empty column below them on its way somewhere else.

- Going back returns to where you were. The view no longer blanks while an entry loads, so the container keeps its height and there is somewhere to put the old position. Coming back to a long entry from a short one retries until the incoming content is tall enough, rather than settling for the short one's maximum.

### New

- Files a bundle carries but does not index are served at `/raw/…`. An image in an entry displays, and a link to a contract or a spreadsheet beside the notes about it opens in a new tab instead of a page that does not exist.

  Entries are served there too, as the bytes on disk. `/api/entry` hands back a parsed entry, body separated from frontmatter, and you cannot rebuild the file from that, so `/raw/notes/a.md` is what a backup or a diff should read.

  Only paths the index refers to are servable, so a request stays a map lookup rather than a file search. A `.env` sitting next to your notes has no key and cannot be asked for.

  Anything that reads as text displays as text, so a `.sol` or a `.rs` opens as source instead of landing in your downloads folder. The bytes decide rather than a list of extensions, which would always be missing the language someone actually uses.

  Content types are declared and never sniffed. `.html` downloads rather than displays, since an entry's HTML is deliberately not rendered and serving it from this origin would undo that. SVG displays, under a policy that blocks script and sandboxes the document: a diagram works, and a script inside one cannot reach the API.

- The console says what moved: `v4, /notes/a.md /notes/b.md, 2 listening`. One line per version announced to clients, whether it moved because the watcher saw an edit or because a checkbox was ticked. Long lists are cut off after five paths, since a `tidy --all` would otherwise bury whatever happens next.

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
