# wikiview

> A web UI for [agentic-wiki](https://github.com/agentic-wiki/wiki) bundles.

A bundle is a folder of Markdown that an agent maintains and the `wiki` CLI queries like a database. wikiview is the screen for it: a reader you can browse, with kanban boards and dataset tables as views onto the same index.

```sh
wikiview --root my-kb    # serves on http://localhost:8080
```

## What it is

A lens over files it does not own. An agent edits this bundle while the UI is open, someone else has it in Obsidian, `wiki move` relocates half of it. So the UI keeps no state that isn't in the files and enforces no rule the files can break. It follows along within a second of any change.

A reader by default. Serving a bundle opens its front door and you navigate by links, the way the format intends. A board is a view you switch into over one folder, not what the server is for.

It reads, and it makes structured edits: tick a checkbox, change a status, set a field. It does not edit prose. Your real editor is already open on these files and an agent is writing them at the same time, so a browser textarea would be the worst of the three. That is the line that keeps this from becoming a worse Obsidian.

## Relationship to `wiki`

`wiki` is the engine and stays one: a static binary with a single dependency, a neutral index over a folder. wikiview imports its packages instead of shelling out to the CLI, so a rule like link resolution has exactly one implementation and it lives in the engine. Shelling out would let each side keep its own copy, and copies drift.

Configuration lives in the bundle's own `wiki.toml` under `[tool.wikiview]`, read through `bundle.DecodeTool`. No satellite config file, no second TOML parser, and all of it optional: a stock bundle serves with none.

## Status

You can browse a bundle, follow links, jump to headings, and tick checkboxes, which write to the file. Boards, dataset grids, and git actions come next. The plan is in [`backlog/`](backlog/index.md), which is itself a wiki bundle that wikiview serves.

```
GET  /api/bundle              the bundle itself: dir, spec, entry count, [tool.*] tables, version
GET  /api/tree                the folder tree, each folder's entries and its index.md if it has one
GET  /api/entry/{path...}     one entry: the markdown as written, frontmatter, checkboxes,
                              plus resolved-link and heading-id tables
GET  /api/events              server-sent events carrying the current version
PUT  /api/checkbox/{path...}  toggle a checkbox, guarded by the version you read
```

## How it fits together

The server resolves the engine's rules and sends the answers as data. The client renders.

Two things a browser must not work out for itself. A body link is written relative, like `./b.md`, and resolving it against the bundle root is the engine's rule. An `#anchor` has to land on the heading `wiki check` thinks it names, and every markdown library brings its own slugger: goldmark turns `and_underscore` into `and-underscore` where the engine keeps the underscore, matching GitHub. A near-match is the worst case, because `check` calls the anchor valid while the page silently fails to scroll.

So both travel as lookup tables beside the body. The client renders markdown with whatever stack it likes and resolves a link by looking up the href it meets. Anything missing from the table, an external URL or a link that climbs out of the bundle, is left exactly as written. The body itself stays markdown, which is what an editor would save back and what a plugin pipeline wants as input.

A watcher keeps the index in step with the files. Clients hear a version number over SSE, never a payload, and refetch whatever they are looking at, so a client that missed ten events pulls once and is correct again. The version only moves when content really changed, so a save that edited nothing does not churn every open tab.

Writes carry the version their data was read at. A checkbox is addressed by line number, and a line number only means something against the content it came from. If the entry changed underneath, the write is refused instead of landing on whatever now sits there.

```sh
just serve      # serves this repo's own backlog
just check      # vet, lint and tests, Go and UI
just backlog    # check the backlog with the engine it is built on
```

## Install

```sh
brew install agentic-wiki/tap/wikiview
```

To build it yourself you need `wiki` v0.9.0 or later and [bun](https://bun.sh) for the frontend.

```sh
just build      # builds the UI into the binary
just test-all   # unit, UI, and end-to-end
```
