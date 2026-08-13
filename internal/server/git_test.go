package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/agentic-wiki/wikiview/internal/git"
	"github.com/agentic-wiki/wikiview/internal/store"
)

// A bundle that is also a clone, which is the shape the actions assume.
func newGitServer(t *testing.T) (*Server, string) {
	t.Helper()
	if !git.Available() {
		t.Skip("git is not installed")
	}
	run := func(dir string, args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	root := t.TempDir()
	remote := filepath.Join(root, "remote.git")
	run(root, "init", "--bare", "--initial-branch=main", remote)

	dir := filepath.Join(root, "kb")
	run(root, "clone", "--quiet", remote, dir)
	for _, kv := range [][2]string{{"user.email", "t@e.com"}, {"user.name", "t"}, {"commit.gpgsign", "false"}} {
		run(dir, "config", kv[0], kv[1])
	}
	for name, body := range map[string]string{
		"wiki.toml": "spec = \"0.1\"\n",
		"index.md":  "---\nokf_version: \"0.1\"\n---\nhome\n",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	run(dir, "add", ".")
	run(dir, "commit", "--quiet", "--message", "first")
	run(dir, "push", "--quiet", "--set-upstream", "origin", "main")

	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return New(s, nil), remote
}

func gitStatus(t *testing.T, srv *Server, path string) gitResult {
	t.Helper()
	var got gitResult
	get(t, srv, path, &got)
	return got
}

// A bundle is a folder first. Most folders are not repositories, and the answer
// says so rather than failing.
func TestGitStatusOnAPlainFolder(t *testing.T) {
	srv := newTestServer(t)
	if got := gitStatus(t, srv, "/api/git"); got.Status.Repo {
		t.Errorf("status = %+v, want repo=false", got.Status)
	}
}

func TestGitStatusPreviewsWhatWouldBeCommitted(t *testing.T) {
	srv, _ := newGitServer(t)
	dir := srv.store.Dir
	if err := os.WriteFile(filepath.Join(dir, "note.md"), []byte("---\ntype: note\n---\nn\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := gitStatus(t, srv, "/api/git")
	if !got.Status.Repo || got.Status.Branch != "main" || got.Status.Remote != "origin/main" {
		t.Fatalf("status = %+v", got.Status)
	}
	if len(got.Status.Changes) != 1 || got.Status.Changes[0].Path != "note.md" {
		t.Errorf("changes = %+v, want the one new file named", got.Status.Changes)
	}
}

func TestSyncCommitsPushesAndRebuilds(t *testing.T) {
	srv, remote := newGitServer(t)
	before := srv.store.View().Version
	if err := os.WriteFile(filepath.Join(srv.store.Dir, "note.md"), []byte("---\ntype: note\n---\nn\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	var got gitResult
	code, _ := send(t, srv, http.MethodPost, "/api/git/sync", map[string]string{"message": "add a note"})
	if code != http.StatusOK {
		t.Fatalf("POST = %d", code)
	}
	got = gitStatus(t, srv, "/api/git")
	if len(got.Status.Changes) != 0 {
		t.Errorf("the tree is still dirty: %+v", got.Status.Changes)
	}
	// On the remote, which is the only proof that matters.
	out, err := exec.Command("git", "-C", remote, "log", "--oneline", "-1").Output()
	if err != nil || !strings.Contains(string(out), "add a note") {
		t.Errorf("the remote's last commit is %q (%v)", out, err)
	}
	// And the index is untouched, because a commit does not change a working
	// file. Only a pull moves content under the reader, which is why that one
	// rebuilds and this one has nothing to rebuild from.
	if srv.store.View().Version != before {
		t.Error("a sync moved the version, and nothing on disk changed")
	}
}

// The rule the task turns on, end to end: the failure is reported, the tree is
// restored, and the way out arrives with the problem.
func TestAFailedPullAnswersWithTheWayOut(t *testing.T) {
	srv, remote := newGitServer(t)
	dir := srv.store.Dir
	run := func(where string, args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = where
		cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	other := filepath.Join(t.TempDir(), "other")
	run(filepath.Dir(other), "clone", "--quiet", remote, other)
	for _, kv := range [][2]string{{"user.email", "o@e.com"}, {"user.name", "o"}, {"commit.gpgsign", "false"}} {
		run(other, "config", kv[0], kv[1])
	}
	if err := os.WriteFile(filepath.Join(other, "clash.md"), []byte("theirs\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run(other, "add", ".")
	run(other, "commit", "--quiet", "--message", "theirs")
	run(other, "push", "--quiet")

	if err := os.WriteFile(filepath.Join(dir, "clash.md"), []byte("mine\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run(dir, "add", ".")
	run(dir, "commit", "--quiet", "--message", "mine")

	if code, _ := send(t, srv, http.MethodPost, "/api/git/fetch", nil); code != http.StatusOK {
		t.Fatalf("fetch = %d", code)
	}

	body := sendFor[gitResult](t, srv, http.MethodPost, "/api/git/pull", nil, http.StatusConflict)
	if !strings.Contains(body.Error, "undone") {
		t.Errorf("error does not say the pull was undone: %q", body.Error)
	}
	if !strings.HasPrefix(body.Proposed, "wikiview/") {
		t.Errorf("no branch was proposed: %q", body.Proposed)
	}
	// The local work is intact and the tree is not mid-rebase.
	if body, _ := os.ReadFile(filepath.Join(dir, "clash.md")); !strings.Contains(string(body), "mine") {
		t.Errorf("the local version was lost: %s", body)
	}

	// And the proposed branch is a real way out.
	code, _ := send(t, srv, http.MethodPost, "/api/git/branch", map[string]string{"name": body.Proposed})
	if code != http.StatusOK {
		t.Fatalf("branch = %d", code)
	}
	out, _ := exec.Command("git", "-C", remote, "branch", "--list", body.Proposed).Output()
	if !strings.Contains(string(out), body.Proposed) {
		t.Errorf("the remote has no such branch: %q", out)
	}
}

func TestRefreshRebuildsWithoutGit(t *testing.T) {
	srv := newTestServer(t)
	before := srv.store.View().Version
	if err := os.WriteFile(filepath.Join(srv.store.Dir, "notes", "new.md"),
		[]byte("---\ntype: note\n---\nn\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if code, _ := send(t, srv, http.MethodPost, "/api/refresh", nil); code != http.StatusOK {
		t.Fatalf("refresh = %d", code)
	}
	if srv.store.View().Version == before {
		t.Error("refresh did not rebuild")
	}
}

// sendFor posts and decodes the body, whatever the status: these endpoints
// answer with the repository's state on failure as well as on success, because a
// client just told an action failed needs to know where that left things.
func sendFor[T any](t *testing.T, srv *Server, method, path string, body any, want int) T {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(method, path, bytes.NewReader(raw)))
	if rec.Code != want {
		t.Fatalf("%s %s = %d, want %d: %s", method, path, rec.Code, want, rec.Body)
	}
	var out T
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("%s %s: %v (body %q)", method, path, err, rec.Body)
	}
	return out
}
