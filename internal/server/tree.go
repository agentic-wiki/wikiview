package server

import (
	"net/http"
	"path"
	"slices"
	"strings"

	"github.com/agentic-wiki/wiki/index"
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
type EntryStub struct {
	Path  string `json:"path"`
	Name  string `json:"name"`
	Type  string `json:"type"`
	Title string `json:"title,omitempty"`
}

func (s *Server) handleTree(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, buildTree(s.store.Snapshot()))
}

func buildTree(idx *index.Index) *TreeNode {
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
			Path:  e.Path,
			Name:  path.Base(e.Path),
			Type:  e.Type,
			Title: e.Field("title"),
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
	n := &TreeNode{Path: dir, Name: path.Base(dir), Entries: []EntryStub{}, Children: []*TreeNode{}}
	folders[dir] = n
	parent.Children = append(parent.Children, n)
	return n
}
