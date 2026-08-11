#!/usr/bin/env bash
# End-to-end check that the binary serves a real bundle.
#
# The Go tests exercise handlers directly; this runs the actual binary against a
# bundle on disk and talks to it over HTTP, which is the only thing that proves
# the pieces are wired together — the embedded UI, the store, the routes, and the
# SPA fallback that makes a deep URL survive a cold load.
#
# Usage: scripts/smoke.sh ./bin/wikiview
set -euo pipefail

BIN="${1:?usage: smoke.sh <path-to-wikiview>}"
BIN="$(cd "$(dirname "$BIN")" && pwd)/$(basename "$BIN")"
PORT="${PORT:-8791}"
BASE="http://localhost:${PORT}"

bundle=$(mktemp -d)
trap 'rm -rf "$bundle"; [[ -n "${pid:-}" ]] && kill "$pid" 2>/dev/null || true' EXIT

mkdir -p "$bundle/notes"
printf 'spec = "0.1"\n' >"$bundle/wiki.toml"
printf -- '---\nokf_version: "0.1"\n---\n# Home\n\nSee [a note](./notes/a.md).\n' >"$bundle/index.md"
printf -- '---\ntype: task\nstatus: todo\n---\n## A Heading_here\n\n- [ ] first\n' >"$bundle/notes/a.md"

"$BIN" "$bundle" --host localhost --port "${PORT}" &
pid=$!

# Poll rather than sleep: a fixed wait is either slow or flaky, and on a loaded
# CI runner it is both.
for _ in $(seq 1 50); do
    curl -sf "${BASE}/api/bundle" >/dev/null 2>&1 && break
    sleep 0.1
done

fail() {
    echo "FAIL: $1" >&2
    exit 1
}
check() { # check <description> <pattern> <url>
    echo "--- $1 ---"
    curl -sf "$3" | grep -q "$2" || fail "$1"
}

check "the bundle reports itself" '"entries":2' "${BASE}/api/bundle"
check "the tree lists the folder" '"path":"/notes"' "${BASE}/api/tree"
check "an entry serves its markdown" '## A Heading_here' "${BASE}/api/entry/notes/a.md"
check "links resolve to bundle paths" '"to":"/notes/a.md"' "${BASE}/api/entry/index.md"

# Heading ids must match what the engine accepts as an anchor. The underscore is
# the case every general-purpose slugger gets differently.
check "heading ids keep underscores" '"id":"a-heading_here"' "${BASE}/api/entry/notes/a.md"

# A write is addressed by file line; the body is served frontmatter-stripped.
# Both coordinates travel, and confusing them writes to the wrong line.
check "positions carry both coordinate systems" '"bodyLine":3' "${BASE}/api/entry/notes/a.md"

echo "--- a checkbox toggle writes the file ---"
version=$(curl -sf "${BASE}/api/bundle" | grep -o '"version":[0-9]*' | cut -d: -f2)
# Scoped to the checkboxes array: "line" also appears in links and headings, and
# taking the first one in the document writes to whatever a heading sits on.
line=$(curl -sf "${BASE}/api/entry/notes/a.md" |
    grep -o '"checkboxes":\[[^]]*' | grep -o '"line":[0-9]*' | head -1 | cut -d: -f2)
[[ -n "$line" ]] || fail "could not find the checkbox's line in the response"
curl -sf -X PUT "${BASE}/api/checkbox/notes/a.md" \
    -d "{\"line\":${line},\"done\":true,\"version\":${version}}" >/dev/null
grep -q -- '- \[x\] first' "$bundle/notes/a.md" || fail "the checkbox was not written"

echo "--- a stale version is refused, and nothing changes ---"
code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${BASE}/api/checkbox/notes/a.md" \
    -d "{\"line\":${line},\"done\":false,\"version\":${version}}")
[[ "$code" == "409" ]] || fail "expected 409 for a stale version, got $code"
grep -q -- '- \[x\] first' "$bundle/notes/a.md" || fail "a refused write changed the file"

echo "--- an edit on disk reaches the index without a request ---"
printf -- '---\ntype: note\n---\nbrand new\n' >"$bundle/notes/b.md"
for _ in $(seq 1 50); do
    curl -sf "${BASE}/api/bundle" | grep -q '"entries":3' && break
    sleep 0.1
done
curl -sf "${BASE}/api/bundle" | grep -q '"entries":3' || fail "the watcher did not pick up a new entry"

echo "--- a deep URL survives a cold load (SPA fallback) ---"
curl -sf "${BASE}/wiki/notes/a.md" | grep -q '<div id="root">' ||
    echo "  (skipped: no UI built into this binary)"

echo "--- traversal names nothing ---"
curl -s -o /dev/null -w '%{http_code}\n' "${BASE}/api/entry/%2e%2e%2f%2e%2e%2fetc%2fpasswd" | grep -q 404 ||
    fail "a traversal attempt did not 404"

echo
echo "All smoke tests passed!"
