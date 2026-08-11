package main

import (
	"strings"
	"testing"
)

// The path is positional, so it and the flags can arrive in any arrangement.
// Go's flag package stops at the first non-flag argument, which would take the
// path and then quietly ignore everything after it — a wrong port is the kind
// of thing you notice only when the browser will not connect.
func TestArgsInAnyOrder(t *testing.T) {
	for _, tc := range []struct {
		args []string
		want options
	}{
		{[]string{}, options{root: ".", host: "localhost", port: 8080}},
		{[]string{"my-kb"}, options{root: "my-kb", host: "localhost", port: 8080}},

		// The case that motivates parsing in rounds: flags after the path.
		{[]string{"my-kb", "--port", "3000"}, options{root: "my-kb", host: "localhost", port: 3000}},
		{[]string{"--port", "3000", "my-kb"}, options{root: "my-kb", host: "localhost", port: 3000}},
		{
			[]string{"--host", "0.0.0.0", "my-kb", "--port", "3000"},
			options{root: "my-kb", host: "0.0.0.0", port: 3000},
		},
		{
			[]string{"my-kb", "--host", "0.0.0.0", "--port", "3000"},
			options{root: "my-kb", host: "0.0.0.0", port: 3000},
		},
		// Single-dash spelling, which Go accepts and people type.
		{[]string{"-port", "3000", "my-kb"}, options{root: "my-kb", host: "localhost", port: 3000}},

		// A path that looks like the reserved word only when it is exactly that.
		{[]string{"version"}, options{root: ".", host: "localhost", port: 8080, version: true}},
		{[]string{"./version"}, options{root: "./version", host: "localhost", port: 8080}},
		{[]string{"--version"}, options{root: ".", host: "localhost", port: 8080, version: true}},
		{[]string{"my-kb", "--version"}, options{root: "my-kb", host: "localhost", port: 8080, version: true}},
	} {
		got, err := parseArgs(tc.args)
		if err != nil {
			t.Errorf("parseArgs(%q) errored: %v", tc.args, err)
			continue
		}
		if got != tc.want {
			t.Errorf("parseArgs(%q) = %+v, want %+v", tc.args, got, tc.want)
		}
	}
}

// Two paths is a mistake worth naming rather than silently taking the first.
func TestArgsRejectsASecondPath(t *testing.T) {
	if _, err := parseArgs([]string{"my-kb", "other-kb"}); err == nil {
		t.Error("two paths were accepted")
	} else if !strings.Contains(err.Error(), "other-kb") {
		t.Errorf("err=%q, want it to name the argument it did not expect", err)
	}
}

// Prints usage to stderr on the way past, which is what a person typing it
// should get.
func TestArgsRejectsAnUnknownFlag(t *testing.T) {
	if _, err := parseArgs([]string{"--nope"}); err == nil {
		t.Error("an unknown flag was accepted")
	}
}

// Gates the warning about serving without authentication, so a host wrongly
// judged local is a warning nobody sees.
func TestLoopback(t *testing.T) {
	for _, tc := range []struct {
		host string
		want bool
	}{
		{"localhost", true},
		{"127.0.0.1", true},
		{"127.0.0.53", true}, // the whole 127/8 block, not just .1
		{"::1", true},

		{"0.0.0.0", false},
		{"::", false},
		{"192.168.1.10", false},
		{"example.com", false}, // a name that is not localhost resolves elsewhere
		// Empty means every interface to a listener, which is the least local
		// thing there is — and the easiest to read as "nothing specified".
		{"", false},
	} {
		if got := loopback(tc.host); got != tc.want {
			t.Errorf("loopback(%q) = %v, want %v", tc.host, got, tc.want)
		}
	}
}
