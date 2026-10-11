// Copyright 2023 The casbin Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package object

import (
	"crypto/sha256"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/deluxebear/jetauth/conf"
	"github.com/deluxebear/jetauth/util"
)

const (
	defaultSiteRefreshInterval = 5 * time.Second
	// forcedFullRefreshInterval bounds how stale the in-memory maps can get
	// even when the cheap change fingerprint says nothing changed (e.g. DNS
	// retries or out-of-band DB edits that do not bump updated_time).
	forcedFullRefreshInterval = 60 * time.Second
)

var siteCertLocks sync.Map // site id -> *sync.Mutex

// lockSiteCert serializes certificate work per site. It is deliberately NOT a
// global lock: request paths only take siteMapMu/ruleMapMu (briefly), and cert
// renewal (DB + ACME HTTP calls) never holds those.
func lockSiteCert(id string) func() {
	v, _ := siteCertLocks.LoadOrStore(id, &sync.Mutex{})
	m := v.(*sync.Mutex)
	m.Lock()
	return m.Unlock
}

// monitorSiteCerts checks certs for the given sites (the snapshot taken by the
// last refresh), so no extra GetGlobalSites() query is needed.
func monitorSiteCerts(sites []*Site) error {
	for _, site := range sites {
		unlock := lockSiteCert(site.GetId())
		err := site.checkCerts()
		unlock()
		if err != nil {
			return err
		}
	}
	return nil
}

// getSiteRefreshInterval reads `siteRefreshIntervalSeconds` (default 5).
func getSiteRefreshInterval() time.Duration {
	return parseSiteRefreshInterval(conf.GetConfigString("siteRefreshIntervalSeconds"))
}

func parseSiteRefreshInterval(v string) time.Duration {
	v = strings.TrimSpace(v)
	if v == "" {
		return defaultSiteRefreshInterval
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil || n <= 0 {
		return defaultSiteRefreshInterval
	}
	return time.Duration(n) * time.Second
}

// refreshTracker decides whether an in-memory map must be rebuilt, based on a
// cheap fingerprint of the backing tables plus a periodic forced refresh.
type refreshTracker struct {
	mu       sync.Mutex
	last     string
	hasLast  bool
	lastFull time.Time
}

func (t *refreshTracker) shouldRefresh(fp string, now time.Time, forceEvery time.Duration) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return !t.hasLast || fp != t.last || now.Sub(t.lastFull) >= forceEvery
}

func (t *refreshTracker) markRefreshed(fp string, now time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.last, t.hasLast, t.lastFull = fp, true, now
}

var (
	siteRefreshTracker refreshTracker
	ruleRefreshTracker refreshTracker
)

// tableFingerprint returns "count|max(column)" for a table: a cheap query
// that changes on insert, delete and (when the column is bumped) update.
func tableFingerprint(bean interface{}, column string) (string, error) {
	rows, err := ormer.Engine.Table(bean).Select(fmt.Sprintf("count(*) AS c, COALESCE(MAX(%s), '') AS m", column)).QueryString()
	if err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "", nil
	}
	return rows[0]["c"] + "|" + rows[0]["m"], nil
}

// Columns hashed into the site fingerprint. Second-resolution timestamps miss
// same-second edits, and Cert / Application have no updated_time at all, so
// for those tables the fingerprint hashes the content the gateway consumes
// (certificate material and expiry, client credentials, redirect URIs, ...).
// public_ip is deliberately excluded: the DNS retry path rewrites it.
var (
	siteFingerprintCols = []string{"owner", "name", "updated_time", "domain", "other_domains", "need_redirect", "rules", "host", "port", "hosts", "ssl_mode", "status", "casdoor_application", "enable_biz_authz", "biz_authz_bypass", "biz_authz_fail_mode"}
	certFingerprintCols = []string{"owner", "name", "created_time", "expire_time", "domain_expire_time", "certificate", "private_key"}
	appFingerprintCols  = []string{"owner", "name", "created_time", "organization", "cert", "client_id", "client_secret", "client_cert", "redirect_uris", "grant_types", "token_format", "expire_in_hours", "refresh_expire_in_hours"}
)

// hashRows returns "count|sha256" over the given rows restricted to cols. Rows
// are sorted so the result does not depend on database row order.
func hashRows(rows []map[string]string, cols []string) string {
	lines := make([]string, 0, len(rows))
	var sb strings.Builder
	for _, row := range rows {
		sb.Reset()
		for _, c := range cols {
			sb.WriteString(row[c])
			sb.WriteByte(0x1f)
		}
		lines = append(lines, sb.String())
	}
	sort.Strings(lines)
	h := sha256.New()
	for _, l := range lines {
		h.Write([]byte(l))
		h.Write([]byte{0x1e})
	}
	return fmt.Sprintf("%d|%x", len(rows), h.Sum(nil))
}

// contentFingerprint hashes the selected columns of every row of a table.
// Cheap enough for the small config tables involved (sites, certs, apps) and
// catches edits that tables without a reliable updated_time would miss.
func contentFingerprint(bean interface{}, cols []string) (string, error) {
	rows, err := ormer.Engine.Table(bean).Select(strings.Join(cols, ", ")).QueryString()
	if err != nil {
		return "", err
	}
	return hashRows(rows, cols), nil
}

func siteFingerprint() (string, error) {
	parts := []struct {
		bean interface{}
		cols []string
	}{
		{&Site{}, siteFingerprintCols},
		{&Cert{}, certFingerprintCols},
		{&Application{}, appFingerprintCols},
	}
	var sb strings.Builder
	for _, p := range parts {
		fp, err := contentFingerprint(p.bean, p.cols)
		if err != nil {
			return "", err
		}
		sb.WriteString(fp)
		sb.WriteString(";")
	}
	return sb.String(), nil
}

func ruleFingerprint() (string, error) {
	return tableFingerprint(&Rule{}, "updated_time")
}

// refreshIfChanged rebuilds a map only when its fingerprint changed (or the
// forced interval elapsed). A fingerprint error falls back to refreshing.
func refreshIfChanged(t *refreshTracker, fingerprint func() (string, error), refresh func() error) error {
	now := time.Now()
	fp, fpErr := fingerprint()
	if fpErr == nil && !t.shouldRefresh(fp, now, forcedFullRefreshInterval) {
		return nil
	}
	if err := refresh(); err != nil {
		return err
	}
	if fpErr == nil {
		t.markRefreshed(fp, now)
	}
	return nil
}

func StartMonitorSitesLoop() {
	fmt.Printf("StartMonitorSitesLoop() Start!\n\n")
	interval := getSiteRefreshInterval()
	go func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("[%s] Recovered from StartMonitorSitesLoop() panic: %v\n", util.GetCurrentTime(), r)
				StartMonitorSitesLoop()
			}
		}()

		for {
			err := refreshIfChanged(&siteRefreshTracker, siteFingerprint, refreshSiteMap)
			if err != nil {
				fmt.Println(err)
				time.Sleep(interval)
				continue
			}

			err = refreshIfChanged(&ruleRefreshTracker, ruleFingerprint, refreshRuleMap)
			if err != nil {
				fmt.Println(err)
				time.Sleep(interval)
				continue
			}

			err = monitorSiteCerts(getSiteListSnapshot())
			if err != nil {
				fmt.Println(err)
				time.Sleep(interval)
				continue
			}

			time.Sleep(interval)
		}
	}()
}
