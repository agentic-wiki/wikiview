package server

import (
	"maps"
	"net/http"
	"slices"
	"strings"

	"github.com/agentic-wiki/wiki/index"
	"github.com/agentic-wiki/wikiview/internal/config"
	"github.com/agentic-wiki/wikiview/internal/store"
)

// GraphView is a slice of the bundle as nodes and the links between them.
//
// Assembled here for the reason a board is: the config is decoded here, `where`
// is parsed here, and every link is already resolved in the index. A client
// building it would need each entry's links, which is a request per node.
type GraphView struct {
	Path       string   `json:"path"`
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Where      []string `json:"where"`
	Neighbours bool     `json:"neighbours"`
	Nodes      []Node   `json:"nodes"`
	Edges      []Edge   `json:"edges"`
	// Fields are the frontmatter keys under the graph's folder, taken before its
	// filter, for the reason a board sends them: choosing a filter is picking
	// from what is there.
	Fields []Field `json:"fields"`
}

type Node struct {
	Path  string `json:"path"`
	Label string `json:"label"`
	Title string `json:"title,omitempty"`
	Type  string `json:"type,omitempty"`
	// Neighbour is true for an entry drawn only because a filtered one links to
	// it or from it. It is context, and the graph is not about it.
	Neighbour bool `json:"neighbour,omitempty"`
}

// Edge is every link between two nodes, in either direction, as one.
//
// From and To are the direction of the links. A pair linking each other is
// Mutual, and then which one is From says nothing.
type Edge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Mutual bool   `json:"mutual,omitempty"`
	// Via is where the links were written: "body" for a link in the text, or the
	// frontmatter field naming the other entry. Sorted, each once.
	Via []string `json:"via"`
	// Count is how many links this edge stands for, both directions together.
	Count int `json:"count"`
}

func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	v := s.store.View()
	cfg, _ := config.Decode(v.Index.Bundle, v.Index)
	id := strings.Trim(r.PathValue("id"), "/")
	i := slices.IndexFunc(cfg.Graph, func(g config.Graph) bool { return servable(g) && g.ID == id })
	// No built-in graph: every one is declared, so an id nothing declares is a
	// wrong address.
	if i < 0 {
		writeJSON(w, http.StatusNotFound, errorBody{"no graph with that id"})
		return
	}
	writeJSON(w, http.StatusOK, buildGraph(v, cfg.Graph[i]))
}

// servable reports whether a declared graph can be served. One missing its path
// is reported at startup and served nowhere: an empty prefix is how the index
// spells the whole bundle, so serving it would quietly graph everything.
func servable(g config.Graph) bool {
	return g.ID != "" && g.Path != ""
}

// link is one reference from an entry to another, before edges are merged.
type link struct{ from, to, via string }

func buildGraph(v store.View, g config.Graph) GraphView {
	out := GraphView{
		Path:       g.Path,
		ID:         g.ID,
		Name:       viewName(g.Name, g.Path, v.Index.Bundle.Dir),
		Where:      g.Where,
		Neighbours: g.Neighbours,
		Nodes:      []Node{},
		Edges:      []Edge{},
	}

	prefix := g.Path
	if prefix == "/" {
		prefix = ""
	}
	out.Fields = fieldsIn(v.Index.Filter(prefix, nil))

	filtered := map[string]bool{}
	for _, e := range v.Index.Filter(prefix, g.Filters) {
		filtered[e.Path] = true
	}

	entries := map[string]*index.Entry{}
	for _, e := range v.Index.Entries {
		entries[e.Path] = e
	}

	// Every link that touches a filtered entry. Neighbours are whatever sits at
	// the other end, when asked for; otherwise both ends have to be filtered.
	var links []link
	for _, e := range v.Index.Entries {
		for _, l := range linksFrom(v.Index, e, entries) {
			in := filtered[l.from] && filtered[l.to]
			touches := filtered[l.from] || filtered[l.to]
			if in || (g.Neighbours && touches) {
				links = append(links, l)
			}
		}
	}

	onGraph := map[string]bool{}
	for p := range filtered {
		onGraph[p] = true
	}
	for _, l := range links {
		onGraph[l.from], onGraph[l.to] = true, true
	}
	for _, p := range slices.Sorted(maps.Keys(onGraph)) {
		e := entries[p]
		out.Nodes = append(out.Nodes, Node{
			Path:      p,
			Label:     nodeLabel(p, v.Index.Bundle.Dir),
			Title:     e.Field("title"),
			Type:      e.Type,
			Neighbour: !filtered[p],
		})
	}
	out.Edges = merge(links)
	return out
}

// linksFrom is every reference an entry makes to another entry: its body links
// and its frontmatter values naming one, by the rule `frontmatterRefs` uses.
// Self-links and targets not written yet are not references to anything.
func linksFrom(idx *index.Index, e *index.Entry, entries map[string]*index.Entry) []link {
	var out []link
	add := func(to, via string) {
		if to != e.Path && entries[to] != nil {
			out = append(out, link{e.Path, to, via})
		}
	}
	for _, l := range e.Links {
		add(l.Target, "body")
	}
	for key := range e.Frontmatter() {
		if strings.HasPrefix(key, "_") {
			continue // the index's namespace, not the author's
		}
		for _, value := range e.FieldList(key) {
			if !strings.HasSuffix(value, ".md") {
				continue
			}
			if to, outside := idx.ResolveLink(e.Path, value); !outside {
				add(to, key)
			}
		}
	}
	return out
}

// connections counts, for every entry, the distinct entries it is linked with
// either way — its degree on a graph of the whole bundle, by the same edge rule
// a graph draws with. One pass over the index, where asking Backlinks per entry
// would walk it once for each.
func connections(idx *index.Index) map[string]int {
	entries := map[string]*index.Entry{}
	for _, e := range idx.Entries {
		entries[e.Path] = e
	}
	near := map[string]map[string]bool{}
	join := func(a, b string) {
		if near[a] == nil {
			near[a] = map[string]bool{}
		}
		near[a][b] = true
	}
	for _, e := range idx.Entries {
		for _, l := range linksFrom(idx, e, entries) {
			join(l.from, l.to)
			join(l.to, l.from)
		}
	}
	out := make(map[string]int, len(near))
	for p, set := range near {
		out[p] = len(set)
	}
	return out
}

// merge folds links into one edge per pair of entries, whichever way they point.
func merge(links []link) []Edge {
	type pair struct{ a, b string }
	edges := map[pair]*Edge{}
	for _, l := range links {
		k := pair{min(l.from, l.to), max(l.from, l.to)}
		edge := edges[k]
		if edge == nil {
			edge = &Edge{From: l.from, To: l.to}
			edges[k] = edge
		} else if edge.From != l.from {
			edge.Mutual = true
		}
		edge.Count++
		if !slices.Contains(edge.Via, l.via) {
			edge.Via = append(edge.Via, l.via)
		}
	}

	out := make([]Edge, 0, len(edges))
	for _, edge := range edges {
		// A mutual edge has no direction, so it is spelled one way always rather
		// than whichever link happened to be read first.
		if edge.Mutual && edge.From > edge.To {
			edge.From, edge.To = edge.To, edge.From
		}
		slices.Sort(edge.Via)
		out = append(out, *edge)
	}
	// Sorted, so one bundle always answers the same way.
	slices.SortFunc(out, func(a, b Edge) int {
		if c := strings.Compare(a.From, b.From); c != 0 {
			return c
		}
		return strings.Compare(a.To, b.To)
	})
	return out
}

// nodeLabel names a node that has no title of its own.
//
// A folder's own files are named for the folder. On a graph nothing around a
// node says where it lives — no tree, no breadcrumb — so a scatter of dots all
// reading "Index" or "Log" names none of them. The bundle's own take the
// bundle's name, as a view over "/" does.
//
// The index is unqualified, unlike a backlink's "Folder (index)": a node
// standing for its folder is what an index is for. The log is "Folder (log)",
// so it sits beside its folder's index without taking its name.
func nodeLabel(p, bundleDir string) string {
	folder := func(dir string) string {
		if dir == "/" {
			return dirLabel(bundleDir)
		}
		return titleFromFilename(dir)
	}
	if dir := folderOwn(p, "index.md"); dir != "" {
		return folder(dir)
	}
	if dir := folderOwn(p, "log.md"); dir != "" {
		return folder(dir) + " (log)"
	}
	return titleFromFilename(p)
}
