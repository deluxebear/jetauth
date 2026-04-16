// Copyright 2024 The casbin Authors. All Rights Reserved.
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

package rule

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"

	"github.com/deluxebear/casdoor/object"
)

type UaRule struct{}

// Cache compiled regex patterns to avoid recompiling on every request
var (
	regexCacheMu sync.RWMutex
	regexCache   = map[string]*regexp.Regexp{}
)

func getCompiledRegex(pattern string) (*regexp.Regexp, error) {
	regexCacheMu.RLock()
	if re, ok := regexCache[pattern]; ok {
		regexCacheMu.RUnlock()
		return re, nil
	}
	regexCacheMu.RUnlock()

	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, err
	}

	regexCacheMu.Lock()
	regexCache[pattern] = re
	regexCacheMu.Unlock()

	return re, nil
}

func (r *UaRule) checkRule(expressions []*object.Expression, req *http.Request) (*RuleResult, error) {
	userAgent := req.UserAgent()
	for _, expression := range expressions {
		ua := expression.Value
		reason := fmt.Sprintf("expression matched: \"%s %s %s\"", userAgent, expression.Operator, expression.Value)
		switch expression.Operator {
		case "contains":
			if strings.Contains(userAgent, ua) {
				return &RuleResult{Reason: reason}, nil
			}
		case "does not contain":
			if !strings.Contains(userAgent, ua) {
				return &RuleResult{Reason: reason}, nil
			}
		case "equals":
			if userAgent == ua {
				return &RuleResult{Reason: reason}, nil
			}
		case "does not equal":
			if userAgent != ua {
				return &RuleResult{Reason: reason}, nil
			}
		case "match":
			re, err := getCompiledRegex(ua)
			if err != nil {
				return nil, err
			}
			if re.MatchString(userAgent) {
				return &RuleResult{Reason: reason}, nil
			}
		}
	}

	return nil, nil
}
