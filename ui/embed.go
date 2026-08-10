// Package ui carries the built frontend into the binary.
package ui

import (
	"embed"
	"io/fs"
)

// dist is the Vite build output. `all:` so hashed asset filenames and any
// dotfile are included rather than skipped by embed's default rules.
//
//go:embed all:dist
var dist embed.FS

// Assets returns the built app, or nil when nothing has been built into this
// binary — which is the normal case during development, where the app is served
// by Vite and only /api comes from here.
func Assets() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		return nil
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		return nil
	}
	return sub
}
