# wikiview — development workflow

# Default: show available recipes
default:
    @just --list --unsorted

# Check the dev toolchain
[group('dev')]
setup:
    #!/usr/bin/env bash
    set -euo pipefail
    command -v go >/dev/null || { echo "ERROR: Go not found"; exit 1; }
    command -v staticcheck >/dev/null || { echo "Installing staticcheck..."; go install honnef.co/go/tools/cmd/staticcheck@latest; }
    echo "Toolchain ready."

# Format Go source
[group('dev')]
fmt:
    go fmt ./...

# Run go vet
[group('dev')]
vet:
    go vet ./...

# Run staticcheck linter
[group('dev')]
lint:
    staticcheck ./...

# Pre-commit quality gate: vet + lint + test
[group('dev')]
check: vet lint test ui-check ui-test

# Run unit tests
[group('test')]
test:
    go test -timeout 120s ./...

# Run unit tests with the race detector (needs cgo and a C compiler)
[group('test')]
test-race:
    CGO_ENABLED=1 go test -race -timeout 300s ./...

# Coverage summary
[group('test')]
coverage:
    go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out | tail -1

# Check this repo's own backlog with the engine it is built on
[group('test')]
backlog:
    go run github.com/agentic-wiki/wiki/cmd/wiki --root ./backlog check

# Install frontend dependencies (never with install scripts)
[group('build')]
ui-install:
    cd ui && bun install --ignore-scripts

# Build the frontend into ui/dist, which the binary embeds
[group('build')]
ui-build: ui-install
    cd ui && bunx vite build

# Build the binary with the frontend embedded
[group('build')]
build: ui-build
    go build -o bin/wikiview ./cmd/wikiview

# End-to-end: run the real binary against a real bundle over HTTP
[group('test')]
smoke: build
    bash scripts/smoke.sh ./bin/wikiview

# Everything: unit, UI, and end-to-end
[group('test')]
test-all: test ui-test smoke

# Cross-compile every release target without producing artifacts
[group('build')]
cross-compile: ui-build
    #!/usr/bin/env bash
    set -euo pipefail
    for target in darwin/arm64 darwin/amd64 linux/arm64 linux/amd64 windows/amd64 windows/arm64; do
        echo "  $target"
        GOOS=${target%/*} GOARCH=${target#*/} go build -o /dev/null ./cmd/wikiview
    done

# Build a release locally without publishing, and print the Homebrew formula
[group('release')]
release-dry: ui-build
    goreleaser release --snapshot --clean --skip=publish

# Preview the formula that a release would push to the tap
[group('release')]
formula-preview: release-dry
    VERSION=v0.0.0-preview ./scripts/update-formula.sh

# Frontend typecheck
[group('dev')]
ui-check:
    cd ui && bunx tsc -b --noEmit

# Frontend tests: mounts the real app and drives it, so a route is proven to
# render rather than merely to return HTML
[group('test')]
ui-test: ui-install
    cd ui && bun test

# The frontend dev server, proxying /api to a running wikiview
[group('run')]
ui-dev: ui-install
    cd ui && bunx vite

# Serve a bundle (defaults to this repo's own backlog)
[group('run')]
serve root="./backlog" addr="localhost:8080":
    go run ./cmd/wikiview --root {{root}} --addr {{addr}}
