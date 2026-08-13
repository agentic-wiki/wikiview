package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Real repositories in temp directories, not a fake.
//
// The whole argument for shelling out is that these commands behave exactly as
// they do in the user's terminal, and a test against a mock would be testing the
// mock's opinion of git rather than git's.
func must(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@example.com",
		"GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@example.com",
		"GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

func write(t *testing.T, dir, name, content string) {
	t.Helper()
	p := filepath.Join(dir, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// A bare "remote" and a clone of it, which is the shape every action assumes.
func repoPair(t *testing.T) (clone, remote string) {
	t.Helper()
	if !Available() {
		t.Skip("git is not installed")
	}
	root := t.TempDir()
	remote = filepath.Join(root, "remote.git")
	must(t, root, "init", "--bare", "--initial-branch=main", remote)

	clone = filepath.Join(root, "work")
	must(t, root, "clone", "--quiet", remote, clone)
	must(t, clone, "config", "user.email", "t@example.com")
	must(t, clone, "config", "user.name", "t")
	// Signing is the user's business and not this test's: a machine configured
	// to sign commits has an agent, and a container running tests does not.
	must(t, clone, "config", "commit.gpgsign", "false")
	write(t, clone, "index.md", "---\nokf_version: \"0.1\"\n---\nhome\n")
	must(t, clone, "add", ".")
	must(t, clone, "commit", "--quiet", "--message", "first")
	must(t, clone, "push", "--quiet", "--set-upstream", "origin", "main")
	return clone, remote
}

// Not being a repository is an ordinary answer. A bundle is a folder first, and
// most folders are not repositories.
func TestAFolderThatIsNotARepository(t *testing.T) {
	if s := Repo(t.TempDir()); s.Repo {
		t.Errorf("status = %+v, want repo=false", s)
	}
}

func TestStatusReadsTheBranchAndItsUpstream(t *testing.T) {
	clone, _ := repoPair(t)
	s := Repo(clone)
	if !s.Repo || s.Branch != "main" {
		t.Fatalf("status = %+v", s)
	}
	if s.Remote != "origin/main" {
		t.Errorf("remote = %q, want origin/main", s.Remote)
	}
	if s.Ahead != 0 || s.Behind != 0 || len(s.Changes) != 0 {
		t.Errorf("a clean clone reports %+v", s)
	}
}

// The preview has to show everything a commit would carry, including work
// somebody else did: an agent editing alongside is the expected case, and hiding
// its files would be lying about what the button does.
func TestChangesListEverythingInTheBundle(t *testing.T) {
	clone, _ := repoPair(t)
	write(t, clone, "index.md", "---\nokf_version: \"0.1\"\n---\nedited\n")
	write(t, clone, "notes/new.md", "---\ntype: note\n---\nby an agent\n")

	byPath := map[string]string{}
	for _, c := range Repo(clone).Changes {
		byPath[c.Path] = c.Code
	}
	if byPath["index.md"] != " M" {
		t.Errorf("index.md = %q, want modified", byPath["index.md"])
	}
	if byPath["notes/new.md"] != "??" {
		t.Errorf("notes/new.md = %q, want untracked", byPath["notes/new.md"])
	}
}

// A bundle can be a subdirectory of a larger repository, and a button in a notes
// viewer must not sweep up somebody's unrelated work in the same worktree.
func TestChangesAreScopedToTheBundle(t *testing.T) {
	clone, _ := repoPair(t)
	write(t, clone, "elsewhere/code.go", "package main\n")
	write(t, clone, "kb/index.md", "---\nokf_version: \"0.1\"\n---\nnotes\n")
	must(t, clone, "add", ".")
	must(t, clone, "commit", "--quiet", "--message", "second")

	write(t, clone, "elsewhere/code.go", "package main // edited\n")
	write(t, clone, "kb/note.md", "---\ntype: note\n---\nn\n")

	// Asked from inside the bundle, which is the only thing this program ever
	// points at.
	for _, c := range Repo(filepath.Join(clone, "kb")).Changes {
		if strings.Contains(c.Path, "elsewhere") {
			t.Errorf("a change outside the bundle was listed: %+v", c)
		}
	}
	if got := len(Repo(filepath.Join(clone, "kb")).Changes); got != 1 {
		t.Errorf("changes = %d, want only the bundle's one", got)
	}
}

func TestSyncCommitsAndPushes(t *testing.T) {
	clone, remote := repoPair(t)
	write(t, clone, "notes/a.md", "---\ntype: note\n---\na\n")

	s, err := Sync(context.Background(), clone, "add a note")
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Changes) != 0 || s.Ahead != 0 {
		t.Errorf("after a sync the tree is %+v, want clean and level", s)
	}
	// The remote has it, which is the only proof that matters.
	if out := must(t, remote, "log", "--oneline", "-1"); !strings.Contains(out, "add a note") {
		t.Errorf("the remote's last commit is %q", out)
	}
}

func TestSyncNeedsAMessage(t *testing.T) {
	clone, _ := repoPair(t)
	write(t, clone, "notes/a.md", "x")
	if _, err := Sync(context.Background(), clone, "  "); err == nil {
		t.Error("committed with no message")
	}
}

// Nothing to commit is not a failure: somebody else may have committed the work
// between the preview and the click, and pushing what is here is still right.
func TestSyncWithNothingStagedStillPushes(t *testing.T) {
	clone, remote := repoPair(t)
	write(t, clone, "notes/a.md", "---\ntype: note\n---\na\n")
	must(t, clone, "add", ".")
	must(t, clone, "commit", "--quiet", "--message", "committed elsewhere")

	if _, err := Sync(context.Background(), clone, "nothing of mine to add"); err != nil {
		t.Fatal(err)
	}
	if out := must(t, remote, "log", "--oneline", "-1"); !strings.Contains(out, "committed elsewhere") {
		t.Errorf("the remote's last commit is %q", out)
	}
}

func TestPullTakesTheRemotesWork(t *testing.T) {
	clone, remote := repoPair(t)
	// Somebody else pushes, via a second checkout.
	other := filepath.Join(t.TempDir(), "other")
	must(t, filepath.Dir(other), "clone", "--quiet", remote, other)
	must(t, other, "config", "user.email", "o@example.com")
	must(t, other, "config", "user.name", "o")
	must(t, other, "config", "commit.gpgsign", "false")
	write(t, other, "theirs.md", "---\ntype: note\n---\ntheirs\n")
	must(t, other, "add", ".")
	must(t, other, "commit", "--quiet", "--message", "theirs")
	must(t, other, "push", "--quiet")

	if _, err := Fetch(context.Background(), clone); err != nil {
		t.Fatal(err)
	}
	if s := Repo(clone); s.Behind != 1 {
		t.Fatalf("behind = %d after fetching, want 1", s.Behind)
	}
	if _, err := Pull(context.Background(), clone); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(clone, "theirs.md")); err != nil {
		t.Errorf("the pulled file is not there: %v", err)
	}
	if s := Repo(clone); s.Behind != 0 {
		t.Errorf("behind = %d after pulling", s.Behind)
	}
}

// The rule the whole task turns on. A rebase that stops halfway is a conflicted
// worktree, and a web page has no business asking anybody to resolve one.
func TestAFailedPullLeavesNothingBehind(t *testing.T) {
	clone, remote := repoPair(t)

	other := filepath.Join(t.TempDir(), "other")
	must(t, filepath.Dir(other), "clone", "--quiet", remote, other)
	must(t, other, "config", "user.email", "o@example.com")
	must(t, other, "config", "user.name", "o")
	must(t, other, "config", "commit.gpgsign", "false")
	write(t, other, "clash.md", "---\ntype: note\n---\ntheirs\n")
	must(t, other, "add", ".")
	must(t, other, "commit", "--quiet", "--message", "theirs")
	must(t, other, "push", "--quiet")

	// The same file, differently, here.
	write(t, clone, "clash.md", "---\ntype: note\n---\nmine\n")
	must(t, clone, "add", ".")
	must(t, clone, "commit", "--quiet", "--message", "mine")
	before := must(t, clone, "rev-parse", "HEAD")

	if _, err := Fetch(context.Background(), clone); err != nil {
		t.Fatal(err)
	}
	_, err := Pull(context.Background(), clone)
	if err == nil {
		t.Fatal("the conflicting pull reported success")
	}
	if !strings.Contains(err.Error(), "undone") {
		t.Errorf("error does not say the pull was undone: %v", err)
	}

	// The tree is exactly as it was: same commit, no rebase in progress, and the
	// local work still here.
	if now := must(t, clone, "rev-parse", "HEAD"); now != before {
		t.Errorf("HEAD moved from %s to %s", before, now)
	}
	if _, err := os.Stat(filepath.Join(clone, ".git", "rebase-merge")); !os.IsNotExist(err) {
		t.Error("a rebase is still in progress")
	}
	if out := must(t, clone, "status", "--porcelain"); out != "" {
		t.Errorf("the worktree is dirty after the abort:\n%s", out)
	}
	if body, _ := os.ReadFile(filepath.Join(clone, "clash.md")); !strings.Contains(string(body), "mine") {
		t.Errorf("the local version was lost: %s", body)
	}
}

// And the way out of that failure: the local work goes somewhere safe, to be
// resolved with a real tool on a real checkout.
func TestBranchPushesTheLocalWorkSomewhereSafe(t *testing.T) {
	clone, remote := repoPair(t)
	write(t, clone, "mine.md", "---\ntype: note\n---\nmine\n")
	must(t, clone, "add", ".")
	must(t, clone, "commit", "--quiet", "--message", "mine")

	name := ProposedBranch(time.Date(2026, 8, 12, 14, 30, 0, 0, time.UTC))
	if name != "wikiview/2026-08-12-1430" {
		t.Fatalf("proposed %q", name)
	}
	if _, err := Branch(context.Background(), clone, name); err != nil {
		t.Fatal(err)
	}
	if out := must(t, remote, "branch", "--list", name); !strings.Contains(out, name) {
		t.Errorf("the remote has no such branch: %q", out)
	}
	// And it left you where you were rather than moving you onto it.
	if b := Repo(clone).Branch; b != "main" {
		t.Errorf("branch = %q, want to be left on main", b)
	}
}

func TestBranchRefusesANameThatIsNotOne(t *testing.T) {
	clone, _ := repoPair(t)
	for _, name := range []string{"", "-x", "a b", "a;rm -rf /", strings.Repeat("x", 200)} {
		if _, err := Branch(context.Background(), clone, name); err == nil {
			t.Errorf("accepted %q", name)
		}
	}
}

// A machine configured to sign commits is a machine whose commits are signed,
// and this must not quietly make an exception. Configured exactly as a real one
// is — ssh signing, a key the agent would hold — with no agent to reach.
func TestAFailedSignatureIsNotSilentlyDropped(t *testing.T) {
	clone, _ := repoPair(t)
	must(t, clone, "config", "commit.gpgsign", "true")
	must(t, clone, "config", "gpg.format", "ssh")
	must(t, clone, "config", "user.signingkey", "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIneverloaded")
	t.Setenv("SSH_AUTH_SOCK", "")
	write(t, clone, "notes/a.md", "---\ntype: note\n---\na\n")

	_, err := Sync(context.Background(), clone, "add a note")
	if err == nil {
		t.Fatal("the commit succeeded, so it was made unsigned")
	}
	// Says what it is about, and keeps git's own words, which are the specific
	// ones.
	if !strings.Contains(err.Error(), "could not be signed") {
		t.Errorf("the error does not name signing: %v", err)
	}

	// And nothing was committed: no half-done state to discover later.
	if out := must(t, clone, "log", "--oneline"); strings.Contains(out, "add a note") {
		t.Errorf("a commit was made anyway: %q", out)
	}
}

// A bundle whose commits were made elsewhere has nothing to commit and something
// to push, which is an ordinary state rather than a mistake. Nothing is asked
// about a commit that is not happening.
func TestSyncWithNothingToCommitNeedsNoMessage(t *testing.T) {
	clone, remote := repoPair(t)
	write(t, clone, "notes/a.md", "---\ntype: note\n---\na\n")
	must(t, clone, "add", ".")
	must(t, clone, "commit", "--quiet", "--message", "committed in a terminal")

	if _, err := Sync(context.Background(), clone, ""); err != nil {
		t.Fatalf("a push-only sync asked for a message: %v", err)
	}
	if out := must(t, remote, "log", "--oneline", "-1"); !strings.Contains(out, "committed in a terminal") {
		t.Errorf("the remote's last commit is %q", out)
	}
}

// A bundle can live inside a bigger repository, and somebody who staged
// unrelated work in a terminal must not find it inside a commit the wiki made.
//
// `add -- .` scopes the staging but not the commit: `git commit` with no
// pathspec commits the whole index, whatever else happens to be sitting in it.
func TestSyncCommitsOnlyTheBundle(t *testing.T) {
	clone, _ := repoPair(t)
	bundle := filepath.Join(clone, "bundle")
	write(t, clone, "bundle/index.md", "home\n")
	write(t, clone, "secret.txt", "unrelated\n")
	must(t, clone, "add", ".")
	must(t, clone, "commit", "--quiet", "--message", "second")

	// Work staged outside the bundle, the way a person would in a terminal.
	write(t, clone, "secret.txt", "work in progress\n")
	must(t, clone, "add", "secret.txt")
	// And an entry inside it, the way an agent would.
	write(t, clone, "bundle/b.md", "b\n")

	if _, err := Sync(context.Background(), bundle, "Add b"); err != nil {
		t.Fatalf("sync: %v", err)
	}

	files := must(t, clone, "show", "--name-only", "--format=", "HEAD")
	if !strings.Contains(files, "bundle/b.md") {
		t.Errorf("the entry was not committed: %q", files)
	}
	if strings.Contains(files, "secret.txt") {
		t.Errorf("a commit made from the bundle swept up work outside it: %q", files)
	}
	// And that work is still staged out there, for whoever staged it.
	if staged := must(t, clone, "diff", "--cached", "--name-only"); !strings.Contains(staged, "secret.txt") {
		t.Errorf("the unrelated staged work was taken away: %q", staged)
	}
}

// A sync refused for want of a message leaves the index as it found it. Staging
// first and refusing after hands back a bundle staged by a button nobody got to
// press, and the next `git status` in a terminal shows work somebody did not
// stage.
func TestSyncRefusedForAMessageStagesNothing(t *testing.T) {
	clone, _ := repoPair(t)
	write(t, clone, "b.md", "b\n")

	if _, err := Sync(context.Background(), clone, "   "); err == nil {
		t.Fatal("a sync with something to commit and no message should refuse")
	}
	if staged := must(t, clone, "diff", "--cached", "--name-only"); staged != "" {
		t.Errorf("the refused sync left the index staged: %q", staged)
	}
}
