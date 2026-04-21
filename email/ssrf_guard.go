// Copyright 2026 JetAuth Authors. All Rights Reserved.
package email

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"syscall"
	"time"
)

var blockedCIDRs = mustParseCIDRs([]string{
	"0.0.0.0/8",      // current network
	"10.0.0.0/8",     // RFC1918
	"100.64.0.0/10",  // CGNAT
	"127.0.0.0/8",    // loopback
	"169.254.0.0/16", // link-local + metadata
	"172.16.0.0/12",  // RFC1918
	"192.0.0.0/24",   // IETF
	"192.168.0.0/16", // RFC1918
	"198.18.0.0/15",  // benchmark
	"224.0.0.0/4",    // multicast
	"240.0.0.0/4",    // reserved
	"::1/128",        // IPv6 loopback
	"fc00::/7",       // IPv6 ULA
	"fe80::/10",      // IPv6 link-local
})

// isBlockedIP returns true when ip is in a dangerous private/metadata range,
// unless any allowlist CIDR contains it.
func isBlockedIP(ip net.IP, allowlist []string) bool {
	if ip == nil {
		return true
	}
	allowed := mustParseCIDRs(allowlist)
	for _, c := range allowed {
		if c.Contains(ip) {
			return false
		}
	}
	for _, c := range blockedCIDRs {
		if c.Contains(ip) {
			return true
		}
	}
	return false
}

func mustParseCIDRs(strs []string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(strs))
	for _, s := range strs {
		_, n, err := net.ParseCIDR(s)
		if err != nil {
			continue
		}
		out = append(out, n)
	}
	return out
}

// NewSafeTransport returns an http.RoundTripper that refuses to connect to
// any IP returned in blockedCIDRs, unless allowlist contains the IP.
func NewSafeTransport(allowlist []string) *http.Transport {
	dialer := &net.Dialer{Timeout: 20 * time.Second, KeepAlive: 30 * time.Second}
	return &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			if len(ips) == 0 {
				return nil, fmt.Errorf("no IPs resolved for %s", host)
			}
			for _, ip := range ips {
				if isBlockedIP(ip.IP, allowlist) {
					return nil, &SSRFError{Host: host, IP: ip.IP}
				}
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
		MaxIdleConns:          20,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
}

// SSRFError is returned when an outbound request targets a disallowed IP.
type SSRFError struct {
	Host string
	IP   net.IP
}

func (e *SSRFError) Error() string {
	return fmt.Sprintf("SSRF blocked: host %s resolved to disallowed IP %s", e.Host, e.IP)
}

// IsConnRefused is used by tests to assert dial failure, not SSRF.
func IsConnRefused(err error) bool {
	var se *SSRFError
	if errors.As(err, &se) {
		return false
	}
	var syse syscall.Errno
	if errors.As(err, &syse) {
		return syse == syscall.ECONNREFUSED
	}
	return false
}
