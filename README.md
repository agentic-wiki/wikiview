# wikiview

> A web UI for [agentic-wiki](https://github.com/agentic-wiki/wiki) bundles.

A wiki bundle is a folder of Markdown that an agent maintains and the `wiki` CLI queries like a database. wikiview is the screen for it: point it at the folder, read it in a browser, follow the links, tick the checkboxes.

One binary with the frontend built into it. Your files stay ordinary Markdown.

```sh
cd my-kb && wikiview      # Open http://localhost:8080
```

## Install

Homebrew, on macOS or Linux:

```sh
brew install agentic-wiki/tap/wikiview
```

Or grab a binary directly:

```sh
# macOS
curl -L https://github.com/agentic-wiki/wikiview/releases/latest/download/wikiview_darwin_arm64.tar.gz | tar xz
sudo mv wikiview /usr/local/bin/

# Linux or WSL (amd64)
curl -L https://github.com/agentic-wiki/wikiview/releases/latest/download/wikiview_linux_amd64.tar.gz | tar xz
sudo mv wikiview /usr/local/bin/
```

Other platforms (linux/arm64 for a Raspberry Pi, darwin/amd64, windows/amd64, windows/arm64) are on the [releases page](https://github.com/agentic-wiki/wikiview/releases).

> [!WARNING]
> **Do not use `go install`.** It produces a binary without the UI in it. The
> frontend is built rather than committed. Use Homebrew or a release binary above, or build from
> source below.

From source, with [bun](https://bun.sh) and a Go toolchain:

```sh
git clone https://github.com/agentic-wiki/wikiview && cd wikiview
just build          # builds the frontend, then embeds it in the binary
./bin/wikiview ../backlog
```

## Running it

```sh
wikiview [path] [flags]
```

The path defaults to the working directory and walks up looking for `wiki.toml`, so running it inside a bundle needs no arguments. Flags may come before or after the path.

| Flag | Default | |
| --- | --- | --- |
| `--host` | `localhost` | interface to listen on, `0.0.0.0` for all of them |
| `--port` | `8080` | port to listen on |
| `--version` | | print the version and exit |

```sh
wikiview my-kb --host 0.0.0.0 --port 3000
```

**`--host 0.0.0.0` puts it on your network.** wikiview has no authentication and writes to the bundle, so anyone who can reach it can read every entry and tick boxes in them. It warns on startup when you do this. Put it behind something that authenticates, or keep it on localhost.

## What you get

Browse the folder tree, follow links between entries, jump to headings. A folder opens its `index.md`, or gets a listing if it has none.

Tick a checkbox and it edits the file: one character, written atomically through the engine's write API. That is the only write in the program.

The screen keeps up with the files. An agent or an editor working on the same folder shows up within a second. Entries that changed since you last opened them get a dot in the tree, so you notice the ones you were not watching.

Images display inline. A link to a contract or a spreadsheet sitting beside the notes about it opens in a new tab.

Light, dark and system themes, applied before the first paint.

Boards, dataset tables and git actions are not built yet, and nothing edits prose. Your editor is already open on these files and an agent is writing them at the same time, so a browser textarea would come third. The plan lives in [`backlog/`](backlog/index.md), which is itself a bundle you can serve.

## Configuration

Optional, and it lives in the bundle's own `wiki.toml` under `[tool.wikiview]`, alongside whatever else that file already holds. There is no second config file and nothing to create: a bundle with none of this serves every view.

What it configures is boards. Every bundle already has one — `/kanban/root`, the whole bundle — so this is for the others:

```toml
[[tool.wikiview.board]]
id   = "backlog"
path = "/backlog"
```

That is a whole board, reachable at `/kanban/backlog`. You do not have to type it: with no boards declared, the Boards panel offers a folder to pick and writes this table for you.

The id is what the URL carries and what tells two boards apart; every other key has a default, and writing them out is only worth it when one is wrong:

```toml
[[tool.wikiview.board]]
id      = "backlog"
path    = "/backlog"
name    = "Backlog"       # default: the folder, made readable
where   = ["type=task"]   # default
status  = "status"        # default: the frontmatter field the columns come from
columns = []              # default: column keys inferred from the entries
lane    = ""              # default: no lanes, which is to say one
```

An array of tables rather than a list of paths, because every board has its own settings — and because **two boards can be over one folder**, which is the reason ids exist. Everything and just bugs, or the same tasks grouped by `priority` beside the same tasks grouped by `area`:

```toml
[[tool.wikiview.board]]
id    = "bugs"
path  = "/backlog"
where = ["type=task", "kind=bug"]
```

`where` follows the same spelling as `wiki list --where status!=done`.

An id is a word, never a path: it is the first segment of a board's address, and everything after it is an entry, so `/kanban/backlog/3-reader/006-x.md` opens that card on that board. Ids are declared rather than derived, because a derived one would come from the path and then that first segment would sometimes be an id and sometimes a folder name.

**`columns` orders and adds. It never hides.** A status present in your entries but missing from the list still gets a column, appended after the ones you named. Declaring `["todo", "in-progress", "done"]` pins that order and shows `in-progress` while it is still empty, which is the thing inference cannot do for you — but a card whose status you forgot to list appears anyway rather than vanishing off a board while sitting in the folder. Hiding cards is `where`'s job, where it is explicit.

## HTTP API

Useful for scripting against a running server.

```
GET  /api/bundle              the bundle itself: dir, spec, entry count, [tool.*] tables, version
GET  /api/tree                the folder tree, each folder's entries and its index.md if it has one
GET  /api/entry/{path...}     one entry: body, frontmatter, checkboxes, and resolved-link
                              and heading-id tables
GET  /api/board/{id}          one board as columns of cards, in the config's order,
                              with the frontmatter keys its folder uses
GET  /api/events              server-sent events carrying the current version
GET  /raw/{path...}           a file as it is on disk, frontmatter and all
PUT  /api/checkbox/{path...}  toggle a checkbox, guarded by the version you read
PUT  /api/card/{id}/{path...} move a card to another column of that board, same guard
POST /api/board               declare a board, appending it to the bundle's wiki.toml
PUT  /api/board/{id}          change a board's settings in place
```

A write carries the `version` it was read at, and one that has moved is refused with `409` and the current version. `/api/card` takes the column's value — `{"value": "done", "version": 7}` — and the board decides which frontmatter key that column stands for.

`POST /api/board` takes `{"id": "bugs", "path": "/backlog", "name": "Bugs"}` and appends a `[[tool.wikiview.board]]` table, leaving the rest of the file alone. It refuses an id that is not a word, one already declared, and a folder with no cards under it.

`PUT /api/board/{id}` takes `name`, `where`, `status`, `columns` and `lane` together and rewrites those lines in that board's table. A setting sent empty is a key removed. `id` and `path` are not settings: they are what the board is, and changing an id breaks every link to it. Both writes edit `wiki.toml` line by line and never reserialize it, so comments, other tools' tables and your formatting survive; a value written across several lines is reported rather than edited around.

`/raw` serves what the index refers to, not what the directory contains: every entry, plus every non-entry an entry links to. A `.env` sitting beside your notes has no key there, so it cannot be requested.

It is also the only way to get an entry's exact bytes. `/api/entry` returns the body with frontmatter stripped and the frontmatter parsed, and you cannot reassemble the original file from those.

## Relationship to `wiki`

`wiki` is the engine and stays one: a static binary with a single dependency, a neutral index over a folder. wikiview imports its packages rather than shelling out to the CLI, so a rule like link resolution has exactly one implementation and it lives in the engine.

Install `wiki` too for the terminal side of the same folder: querying, refactoring, `check`, and the skills an agent drives it with.

## Development

```sh
just serve      # build the frontend and serve this repo's own backlog
just check      # vet, lint and tests, Go and UI
just test-all   # unit, UI, and end-to-end
just ui-dev     # the Vite dev server, proxying /api to a running wikiview
```
