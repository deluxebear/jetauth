// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"fmt"

	"github.com/deluxebear/jetauth/i18n"
)

// EnforceTraceResult surfaces WHY an enforce decision came out the way it did.
// BizEnforce returns only a bool — fine for SDK calls on the hot path, but the
// admin test page needs to show the trace so debugging doesn't require
// re-reading all policies by hand.
type EnforceTraceResult struct {
	// Allowed is the final enforcement decision.
	Allowed bool `json:"allowed"`
	// MatchedPolicy is the p-rule that caused Allowed to be true (or the
	// deny rule that caused it to be false, on deny-honoring models).
	// Empty slice when no rule matched.
	MatchedPolicy []string `json:"matchedPolicy"`
	// SubjectRoles is the transitive role closure of the subject in this
	// enforcer's grouping graph — useful to see "why didn't alice match
	// this policy granted to role X?".
	SubjectRoles []string `json:"subjectRoles"`
	// Reason is a short human-readable summary aimed at admins. Localized
	// via the project's i18n.Translate using the caller-supplied language.
	Reason string `json:"reason"`
}

// BizEnforceEx is the trace-aware counterpart to BizEnforce: same inputs, but
// returns the matched rule and the subject's resolved role chain so the UI
// can explain the decision instead of just showing ALLOW/DENY. `lang` is the
// Accept-Language code (from the calling controller) used to localize the
// Reason string.
func BizEnforceEx(owner, appName string, request []interface{}, lang string) (*EnforceTraceResult, error) {
	config, err := getBizAppConfig(owner, appName)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, fmt.Errorf("biz app config not found: %s/%s", owner, appName)
	}
	if !config.IsEnabled {
		return nil, fmt.Errorf("biz app is disabled: %s/%s", owner, appName)
	}

	e, err := GetBizEnforcer(owner, appName)
	if err != nil {
		return nil, err
	}

	allowed, explain, err := e.EnforceEx(request...)
	if err != nil {
		return nil, err
	}

	result := &EnforceTraceResult{
		Allowed:       allowed,
		MatchedPolicy: explain,
		SubjectRoles:  []string{},
	}

	// Resolve the subject's transitive role closure. The first request slot
	// is the subject by convention in every model shape we support (3-arg
	// `sub,obj,act` and 4-arg with eft); higher-arity models aren't
	// accepted upstream so we can rely on index 0.
	if len(request) > 0 {
		sub, ok := request[0].(string)
		if ok && sub != "" {
			if HasRoleDefinition(e.GetModel()) {
				roles, rerr := e.GetImplicitRolesForUser(sub)
				if rerr == nil {
					result.SubjectRoles = roles
				}
			}
		}
	}

	result.Reason = buildEnforceReason(lang, allowed, explain, result.SubjectRoles)
	return result, nil
}

// buildEnforceReason returns a localized human-readable explanation. Template
// strings live under the "biz" namespace in i18n/locales/*/data.json and are
// passed through fmt.Sprintf for any %s arguments.
func buildEnforceReason(lang string, allowed bool, matched, roles []string) string {
	translate := func(template string, args ...interface{}) string {
		localized := i18n.Translate(lang, "biz:"+template)
		if len(args) == 0 {
			return localized
		}
		return fmt.Sprintf(localized, args...)
	}
	if allowed {
		if len(matched) == 0 {
			return translate("Allowed (no specific rule matched — check your matcher / default effect)")
		}
		return translate("Allowed by policy [%s]", joinPolicy(matched))
	}
	if len(matched) > 0 {
		return translate("Denied by policy [%s]", joinPolicy(matched))
	}
	if len(roles) == 0 {
		return translate("Denied: subject has no roles and no direct policy matched")
	}
	return translate("Denied: no policy matched this subject/resource/action combination")
}

func joinPolicy(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}
