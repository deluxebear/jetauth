package email

import (
	"net"
	"testing"
)

func TestIsBlockedIP_LoopbackBlocked(t *testing.T) {
	if !isBlockedIP(net.ParseIP("127.0.0.1"), nil) {
		t.Error("127.0.0.1 must be blocked")
	}
}

func TestIsBlockedIP_PrivateBlocked(t *testing.T) {
	for _, ip := range []string{"10.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.169.254"} {
		if !isBlockedIP(net.ParseIP(ip), nil) {
			t.Errorf("%s must be blocked", ip)
		}
	}
}

func TestIsBlockedIP_PublicAllowed(t *testing.T) {
	if isBlockedIP(net.ParseIP("8.8.8.8"), nil) {
		t.Error("8.8.8.8 must be allowed")
	}
}

func TestIsBlockedIP_AllowlistOverrides(t *testing.T) {
	allow := []string{"10.0.0.0/8"}
	if isBlockedIP(net.ParseIP("10.1.2.3"), allow) {
		t.Error("allowlisted 10.1.2.3 must pass")
	}
}
