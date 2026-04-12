// Copyright 2024 The Casdoor Authors. All Rights Reserved.
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

import "strings"

// GetOrganizationFieldForAuthz returns the Organization field of an entity
// identified by (owner, name) for authz purposes. The urlPath suffix
// determines which table to query. Only the Organization column is fetched
// to keep the lookup lightweight.
func GetOrganizationFieldForAuthz(urlPath string, owner string, name string) (string, error) {
	if owner == "" || name == "" {
		return "", nil
	}

	switch {
	case strings.HasSuffix(urlPath, "-application"):
		var app Application
		has, err := ormer.Engine.Where("owner = ? AND name = ?", owner, name).Cols("organization").Get(&app)
		if err != nil || !has {
			return "", err
		}
		return app.Organization, nil
	case strings.HasSuffix(urlPath, "-token"):
		var token Token
		has, err := ormer.Engine.Where("owner = ? AND name = ?", owner, name).Cols("organization").Get(&token)
		if err != nil || !has {
			return "", err
		}
		return token.Organization, nil
	case strings.HasSuffix(urlPath, "-syncer"):
		var syncer Syncer
		has, err := ormer.Engine.Where("owner = ? AND name = ?", owner, name).Cols("organization").Get(&syncer)
		if err != nil || !has {
			return "", err
		}
		return syncer.Organization, nil
	case strings.HasSuffix(urlPath, "-webhook"):
		var webhook Webhook
		has, err := ormer.Engine.Where("owner = ? AND name = ?", owner, name).Cols("organization").Get(&webhook)
		if err != nil || !has {
			return "", err
		}
		return webhook.Organization, nil
	}

	return "", nil
}
