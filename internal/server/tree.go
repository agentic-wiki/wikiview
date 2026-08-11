package server

import (
	"net/http"
	"path"
	"slices"
	"strings"

	"github.com/agentic-wiki/wiki/index"
	"github.com/agentic-wiki/wikiview/internal/store"
)

// TreeNode is one folder in the bundle: the entries directly inside it and the
// folders below it.
//
// The whole tree is served in one response rather than a folder at a time. It is
// derived from an index already in memory, a reader opens navigation immediately
// and expands it constantly, and a request per folder would be a round trip to
// answer a question the client could have answered locally.
type TreeNode struct {
	Path string `json:"path"` // bundle path of the folder, "/" for the root
	Name string `json:"name"` // basename, "" for the root
	// Label is Name made readable, by the rule that names entries: "3-reader"
	// reads as "Reader". A folder is a navigation step like any other, and a
	// tree that de-slugged its files but not its folders would look half-done.
	Label string `json:"label,omitempty"`
	// Index is the folder's own index.md if it has one. The format makes it
	// optional, so this is empty for a folder that is only a container — which
	// is what tells the reader whether navigating to the folder can land on an
	// entry or has to synthesize a listing.
	Index    string      `json:"index,omitempty"`
	Entries  []EntryStub `json:"entries"`
	Children []*TreeNode `json:"children"`
}

// EntryStub is what a listing needs: enough to render a row and navigate,
// without the body.
//
// Label and Title are different questions. Label is the filename made readable
// and is what navigation shows: you arrived at a file, and a tree that renamed
// it out from under you is a tree you cannot find your way back through. Title
// is what the entry calls itself, which its own page shows and which a search
// can match, and it is empty for an entry that carries none.
//
// Both are derived here rather than in the browser because the same rule names
// backlinks and frontmatter references, which the client is in no position to
// compute. One implementation, so an entry is called the same thing wherever it
// appears.
type EntryStub struct {
	Path  string `json:"path"`
	Name  string `json:"name"`
	Type  string `json:"type"`
	Label string `json:"label"`
	Title string `json:"title,omitempty"`
	// ChangedAt is the bundle version at which this entry's content last moved.
	// Monotonic and per entry, so a client asking "what changed since I looked"
	// compares one number per entry instead of diffing two trees — and a client
	// that missed ten events gets the right answer from the eleventh.
	ChangedAt uint64 `json:"changedAt"`
}

func (s *Server) handleTree(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, buildTree(s.store.View()))
}

func buildTree(v store.View) *TreeNode {
	idx := v.Index
	root := &TreeNode{Path: "/", Entries: []EntryStub{}, Children: []*TreeNode{}}
	folders := map[string]*TreeNode{"/": root}

	// Sorted so the tree is stable between requests: the walk order the index
	// happens to have is not something a client should see change.
	entries := slices.Clone(idx.Entries)
	slices.SortFunc(entries, func(a, b *index.Entry) int { return strings.Compare(a.Path, b.Path) })

	for _, e := range entries {
		dir := path.Dir(e.Path)
		node := folderFor(folders, root, dir)
		node.Entries = append(node.Entries, EntryStub{
			Path:      e.Path,
			Name:      path.Base(e.Path),
			Type:      e.Type,
			Label:     titleFromFilename(e.Path),
			Title:     e.Field("title"),
			ChangedAt: v.ChangedAt[e.Path],
		})
		if path.Base(e.Path) == "index.md" {
			node.Index = e.Path
		}
	}
	return root
}

// folderFor returns the node for dir, creating it and any missing ancestor.
func folderFor(folders map[string]*TreeNode, root *TreeNode, dir string) *TreeNode {
	if dir == "/" || dir == "." || dir == "" {
		return root
	}
	if n, ok := folders[dir]; ok {
		return n
	}
	parent := folderFor(folders, root, path.Dir(dir))
	n := &TreeNode{
		Path:     dir,
		Name:     path.Base(dir),
		Label:    titleFromFilename(dir),
		Entries:  []EntryStub{},
		Children: []*TreeNode{},
	}
	folders[dir] = n
	parent.Children = append(parent.Children, n)
	return n
}
