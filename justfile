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
check: vet lint test

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

# Build the binary
[group('build')]
build:
    go build -o bin/wikiview ./cmd/wikiview

# Serve a bundle (defaults to this repo's own backlog)
[group('run')]
serve root="./backlog" addr="localhost:8080":
    go run ./cmd/wikiview --root {{root}} --addr {{addr}}
