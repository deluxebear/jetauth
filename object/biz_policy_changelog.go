// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_policy_changelog.go implements policy versioning and the changelog
// behind GET /api/biz-watch-policies (TODO.md "业务权限模块 改进计划" 二).
//
// Every committed policy change of a Casbin biz app bumps
// BizAppConfig.PolicyVersion by one and appends the rules that changed to
// biz_policy_changelog under that version. Cheap, provably-correct changes
// (a grantee/member/permission being ADDED) record precise add rules;
// everything whose effect cannot be expressed as a safe delta (removals,
// updates, role/inheritance/group changes, manual sync) records a single
// `full_rebuild` marker so SDKs re-pull the full policy set. Removals are
// deliberately never precise: the same rule can be produced by several
// permissions/roles, so removing it from an SDK copy could be wrong.

package object

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/jetauth/util"
	"github.com/xorm-io/core"
)

// Changelog actions.
const (
	BizChangeAdd         = "add"
	BizChangeRemove      = "remove"
	BizChangeFullRebuild = "full_rebuild"
)

// BizPolicyChangelogRetention is the number of most recent versions kept per
// app. SDKs older than this fall back to a full sync.
const BizPolicyChangelogRetention = 1000

// BizPolicyChangelog is one changed rule (or a full_rebuild marker) at a
// given policy version. All rows written by one appendChangelog call share
// the same version.
type BizPolicyChangelog struct {
	Id        int64  `xorm:"pk autoincr" json:"id"`
	Owner     string `xorm:"varchar(100) notnull index(idx_biz_changelog_app_version)" json:"owner"`
	AppName   string `xorm:"varchar(100) notnull index(idx_biz_changelog_app_version)" json:"appName"`
	Version   int64  `xorm:"bigint notnull index(idx_biz_changelog_app_version)" json:"version"`
	Action    string `xorm:"varchar(20) notnull" json:"action"`
	Ptype     string `xorm:"varchar(10) notnull" json:"ptype"`
	Rule      string `xorm:"text notnull" json:"rule"` // JSON array of strings; "" for full_rebuild
	CreatedAt string `xorm:"varchar(100)" json:"createdAt"`
}

// BizPolicyChange is the wire form of one change in an incremental watch
// response.
type BizPolicyChange struct {
	Action string   `json:"action"` // add | remove
	Ptype  string   `json:"ptype"`  // p | g
	Rule   []string `json:"rule"`
}

// appendChangelog atomically bumps the app's policy_version and records the
// changed rules under the new version. Returns the new version.
//
// action is add / remove / full_rebuild; ptype is p / g ("" for
// full_rebuild). For add/remove an empty rules slice is a no-op (version is
// NOT bumped, returns the current version).
func appendChangelog(owner, appName, action, ptype string, rules [][]string) (int64, error) {
	if action != BizChangeFullRebuild && len(rules) == 0 {
		return getBizPolicyVersion(owner, appName)
	}

	session := ormer.Engine.NewSession()
	defer session.Close()
	if err := session.Begin(); err != nil {
		return 0, err
	}

	pk := core.PK{owner, appName}
	affected, err := session.ID(pk).Incr("policy_version").Update(&BizAppConfig{})
	if err != nil {
		_ = session.Rollback()
		return 0, err
	}
	if affected == 0 {
		_ = session.Rollback()
		return 0, fmt.Errorf("biz app config not found: %s", util.GetId(owner, appName))
	}

	cfg := &BizAppConfig{}
	if _, err := session.ID(pk).Cols("policy_version").Get(cfg); err != nil {
		_ = session.Rollback()
		return 0, err
	}
	version := cfg.PolicyVersion

	now := util.GetCurrentTime()
	var rows []*BizPolicyChangelog
	if action == BizChangeFullRebuild {
		rows = []*BizPolicyChangelog{{Owner: owner, AppName: appName, Version: version, Action: action, Ptype: ptype, Rule: "", CreatedAt: now}}
	} else {
		for _, r := range rules {
			b, err := json.Marshal(r)
			if err != nil {
				_ = session.Rollback()
				return 0, err
			}
			rows = append(rows, &BizPolicyChangelog{Owner: owner, AppName: appName, Version: version, Action: action, Ptype: ptype, Rule: string(b), CreatedAt: now})
		}
	}
	if _, err := session.Insert(&rows); err != nil {
		_ = session.Rollback()
		return 0, err
	}
	if err := session.Commit(); err != nil {
		return 0, err
	}
	return version, nil
}

// getBizPolicyVersion reads the current policy version (0 if the app has
// none yet or does not exist).
func getBizPolicyVersion(owner, appName string) (int64, error) {
	cfg := &BizAppConfig{}
	has, err := ormer.Engine.ID(core.PK{owner, appName}).Cols("policy_version").Get(cfg)
	if err != nil {
		return 0, err
	}
	if !has {
		return 0, fmt.Errorf("biz app config not found: %s", util.GetId(owner, appName))
	}
	return cfg.PolicyVersion, nil
}

// GetBizPolicyVersion is the exported lightweight version query.
func GetBizPolicyVersion(owner, appName string) (int64, error) {
	return getBizPolicyVersion(owner, appName)
}

// getBizChangelogSince returns changelog rows with version in (since, upTo],
// ordered by (version, id).
func getBizChangelogSince(owner, appName string, since, upTo int64) ([]*BizPolicyChangelog, error) {
	rows := []*BizPolicyChangelog{}
	err := ormer.Engine.
		Where("owner = ? AND app_name = ? AND version > ? AND version <= ?", owner, appName, since, upTo).
		Asc("version", "id").
		Find(&rows)
	return rows, err
}

// classifyBizChangelog decides between an incremental and a full response
// for a client at version `since` when the server is at `current`.
//
// It returns the ordered changes when an incremental delta is safe, or
// full=true when the client must re-pull everything: the client is ahead of
// (or at an unknown point relative to) the server, any version in the range
// has been purged (gap), or a full_rebuild marker is present.
func classifyBizChangelog(since, current int64, rows []*BizPolicyChangelog) (changes []*BizPolicyChange, full bool) {
	if since < 0 || since >= current {
		return nil, true
	}
	seen := map[int64]bool{}
	changes = make([]*BizPolicyChange, 0, len(rows))
	for _, r := range rows {
		if r.Action == BizChangeFullRebuild {
			return nil, true
		}
		seen[r.Version] = true
		var rule []string
		if err := json.Unmarshal([]byte(r.Rule), &rule); err != nil {
			return nil, true
		}
		changes = append(changes, &BizPolicyChange{Action: r.Action, Ptype: r.Ptype, Rule: rule})
	}
	// Every version in (since, current] must be present; otherwise part of
	// the history was purged (or a bump was recorded without rows).
	if int64(len(seen)) != current-since {
		return nil, true
	}
	return changes, false
}

// PurgeBizPolicyChangelog keeps only the most recent `keep` versions of each
// app, deleting older rows. Returns the number of rows deleted.
func PurgeBizPolicyChangelog(keep int64) (int64, error) {
	configs := []*BizAppConfig{}
	if err := ormer.Engine.Cols("owner", "app_name", "policy_version").Find(&configs); err != nil {
		return 0, err
	}
	var total int64
	for _, c := range configs {
		cutoff := c.PolicyVersion - keep // versions <= cutoff are dropped
		if cutoff <= 0 {
			continue
		}
		n, err := ormer.Engine.
			Where("owner = ? AND app_name = ? AND version <= ?", c.Owner, c.AppName, cutoff).
			Delete(&BizPolicyChangelog{})
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}

// StartBizPolicyChangelogRetention launches the hourly retention loop. It is
// called from main.go after the DB is initialised (the first purge waits a
// full tick, so it never races boot).
func StartBizPolicyChangelogRetention() {
	util.SafeGoroutine(func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			n, err := PurgeBizPolicyChangelog(BizPolicyChangelogRetention)
			if err != nil {
				logs.Error("biz policy changelog retention failed: %v", err)
			} else if n > 0 {
				logs.Info("biz policy changelog retention: %d rows dropped", n)
			}
		}
	})
}

// ── Change hints (precise add deltas) ──

// bizSyncCtx carries model facts computed during SyncAppPolicies that hint
// functions need.
type bizSyncCtx struct {
	hasEft, honorsDeny, hasRoleDef bool
}

// bizChangeHint lets a CRUD path describe the rules its change ADDED. It is
// evaluated after the app's policies were rebuilt; the delta is only trusted
// when every rule it names is present in the rebuilt set, otherwise the sync
// records a full_rebuild marker instead.
type bizChangeHint struct {
	compute func(c bizSyncCtx) (ptype string, rules [][]string, err error)
}

// bizPermissionAddedHint: rules produced by `permId` (optionally only for one
// grantee subject) are new.
func bizPermissionAddedHint(permId int64, subjectId string) *bizChangeHint {
	return &bizChangeHint{compute: func(c bizSyncCtx) (string, [][]string, error) {
		perm, err := getBizPermissionById(permId)
		if err != nil || perm == nil {
			return "p", nil, err
		}
		rules, err := computePermPPolicies(perm, c.hasEft, c.honorsDeny)
		if err != nil {
			return "p", nil, err
		}
		return "p", filterRulesBySubject(rules, subjectId), nil
	}}
}

// bizMemberAddedHint: `g` rules produced by `roleId` for one user member are new.
func bizMemberAddedHint(roleId int64, subjectId string) *bizChangeHint {
	return &bizChangeHint{compute: func(c bizSyncCtx) (string, [][]string, error) {
		if !c.hasRoleDef {
			return "g", nil, nil
		}
		role, err := getBizRoleById(roleId)
		if err != nil || role == nil {
			return "g", nil, err
		}
		rules, err := computeRoleGPolicies(role)
		if err != nil {
			return "g", nil, err
		}
		return "g", filterRulesBySubject(rules, subjectId), nil
	}}
}

func filterRulesBySubject(rules [][]string, subjectId string) [][]string {
	if subjectId == "" {
		return rules
	}
	out := make([][]string, 0, len(rules))
	for _, r := range rules {
		if len(r) > 0 && r[0] == subjectId {
			out = append(out, r)
		}
	}
	return out
}

// resolveBizHint turns a hint into (ptype, rules, ok). ok=false means the
// delta cannot be trusted and a full_rebuild marker must be recorded.
// `present` are the rules of the final rebuilt set for the hint's ptype.
func resolveBizHint(h *bizChangeHint, c bizSyncCtx, policies, grouping [][]string) (string, [][]string, bool) {
	if h == nil || h.compute == nil {
		return "", nil, false
	}
	ptype, rules, err := h.compute(c)
	if err != nil {
		return "", nil, false
	}
	present := policies
	if ptype == "g" {
		present = grouping
	}
	if !allRulesPresent(rules, present) {
		return "", nil, false
	}
	return ptype, rules, true
}

func allRulesPresent(rules, set [][]string) bool {
	if len(rules) == 0 {
		return true
	}
	index := make(map[string]struct{}, len(set))
	for _, r := range set {
		index[ruleKey(r)] = struct{}{}
	}
	for _, r := range rules {
		if _, ok := index[ruleKey(r)]; !ok {
			return false
		}
	}
	return true
}

func ruleKey(r []string) string {
	b, _ := json.Marshal(r)
	return string(b)
}
