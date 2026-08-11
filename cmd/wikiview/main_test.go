package main

import "testing"

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
