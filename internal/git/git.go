// Package git runs the user's own git against the bundle's folder.
//
// The git binary rather than a library, and not for want of one. These commands
// reach a remote, and reaching a remote means the user's credential helper, ssh
// agent, ssh config, proxy settings, and whatever their `~/.gitconfig` says about
// signing and hooks. A library reimplements that stack badly or asks this program
// to hold credentials, which is a thing a read-only wiki viewer should never do.
// Shelling out means an action here behaves exactly as the same action in their
// terminal.
//
// It also makes git genuinely optional: no binary, no actions, and nothing to
// carry for the bundles that are only a folder.
package git

import (
	"context"
	"errors"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Status is what a bundle's repository looks like right now.
//
// Everything an action needs to preview itself: what would be committed, and how
// far apart the two ends are. Assembled in one call because a preview shows all
// of it at once, and two calls could describe two different moments.
type Status struct {
	// Repo is false when the bundle is not in a repository, or git is not
	// installed. Everything else is then empty and the actions are absent.
	Repo bool `json:"repo"`
	// Branch is the current branch, empty on a detached HEAD.
	Branch string `json:"branch"`
	// Remote is the upstream this branch tracks, empty when it tracks none.
	// Without one there is nothing to pull from or push to.
	Remote string `json:"remote"`
	// Ahead and Behind count commits against the upstream, as of the last fetch.
	// Behind is stale until something fetches: reading it costs no network, and
	// a viewer that reached the network on its own would be doing the thing this
	// task exists to avoid.
	Ahead  int `json:"ahead"`
	Behind int `json:"behind"`
	// Changes are the paths inside the bundle that a commit would include,
	// named from the repository root the way git names them, so a preview reads
	// the same as the commit it describes.
	//
	// Everything in there, not only what wikiview wrote: an agent
	// editing alongside is the expected case, and a preview that hid its work
	// would be lying about what the button does.
	Changes []Change `json:"changes"`
}

// Change is one path a commit would carry, and what happened to it.
type Change struct {
	Path string `json:"path"`
	// Code is git's own two-letter status, so nothing here invents a vocabulary
	// for a thing git already names: "??" is untracked, " M" modified, "A "
	// added, " D" deleted.
	Code string `json:"code"`
}

// timeout bounds anything that might touch the network.
//
// A pull against an unreachable host otherwise hangs until git gives up, holding
// a request open and telling the person waiting nothing.
const timeout = 90 * time.Second

// Available reports whether git is installed at all.
func Available() bool {
	_, err := exec.LookPath("git")
	return err == nil
}

// Repo describes a bundle's folder as a repository. Never an error: not being a
// repository is an ordinary answer, not a failure.
func Repo(dir string) Status {
	// Always a list, never nil: a nil slice marshals as `null`, and a client
	// reading a list it was promised has no reason to check first.
	none := Status{Changes: []Change{}}
	if !Available() {
		return none
	}
	if _, err := run(context.Background(), dir, "rev-parse", "--is-inside-work-tree"); err != nil {
		return none
	}

	s := Status{Repo: true, Changes: []Change{}}
	// A detached HEAD has no branch name, which is a state to report rather than
	// an error: you can still see what changed, you just cannot push.
	if branch, err := run(context.Background(), dir, "rev-parse", "--abbrev-ref", "HEAD"); err == nil && branch != "HEAD" {
		s.Branch = branch
	}
	if remote, err := run(context.Background(), dir, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"); err == nil {
		s.Remote = remote
		s.Ahead, s.Behind = counts(dir)
	}
	s.Changes = changes(dir)
	return s
}

// counts reads how far apart this branch and its upstream are.
func counts(dir string) (ahead, behind int) {
	out, err := run(context.Background(), dir, "rev-list", "--left-right", "--count", "@{upstream}...HEAD")
	if err != nil {
		return 0, 0
	}
	fields := strings.Fields(out)
	if len(fields) != 2 {
		return 0, 0
	}
	behind, _ = strconv.Atoi(fields[0])
	ahead, _ = strconv.Atoi(fields[1])
	return ahead, behind
}

// changes lists what a commit would include, scoped to the bundle.
//
// Scoped because a bundle can be a subdirectory of a larger repository, and
// committing the whole worktree would sweep up work that has nothing to do with
// the notes somebody is reading.
func changes(dir string) []Change {
	// `--untracked-files=all`, because git otherwise collapses a new folder to a
	// single `?? notes/` line. A preview exists to say what will be committed,
	// and "a directory" is not an answer to that.
	out, err := run(context.Background(), dir, "status", "--porcelain", "--untracked-files=all", "--", ".")
	if err != nil || out == "" {
		return []Change{}
	}
	list := []Change{}
	for _, line := range strings.Split(out, "\n") {
		if len(line) < 4 {
			continue
		}
		// A rename reads "R  old -> new"; the new name is the one that exists.
		line = strings.TrimRight(line, "\r")
		path := line[3:]
		if _, after, found := strings.Cut(path, " -> "); found {
			path = after
		}
		list = append(list, Change{Code: line[:2], Path: strings.Trim(path, `"`)})
	}
	return list
}

// run executes git in dir and returns its trimmed stdout.
//
// stderr travels in the error, because git says the useful part there: "there is
// no tracking information for the current branch" is the answer, and swallowing
// it would leave a caller reporting "exit status 1".
func run(ctx context.Context, dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		if ctx.Err() != nil {
			return "", errors.New("git took too long and was stopped")
		}
		if message := strings.TrimSpace(stderr.String()); message != "" {
			return "", errors.New(message)
		}
		return "", err
	}
	// Only the trailing newline. Trimming all whitespace would eat the leading
	// space of a porcelain status line, where the first two columns are the
	// answer and a space is one of the values they take: " M index.md" became
	// "M index.md" and every path lost its first character.
	return strings.TrimRight(string(out), "\r\n"), nil
}
