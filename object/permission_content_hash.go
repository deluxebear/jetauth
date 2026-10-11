// Copyright 2026 The JetAuth Authors. All Rights Reserved.
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
	"encoding/hex"
	"encoding/json"
	"sort"
)

// Validation messages for the content-bound approval; like the field errors they double as i18n
// keys in the "permission" section of the backend locale files.
const (
	PermissionErrContentChanged = "The permission content changed after it was reviewed, reload it and review it again"
	PermissionErrHashRequired   = "A content fingerprint is required to approve a permission"
)

func sortedCopy(values []string) []string {
	res := make([]string, len(values))
	copy(res, values)
	sort.Strings(res)
	return res
}

// ComputeContentHash fingerprints every field that affects the generated policies (the same set
// permissionPolicyFieldsChanged compares, plus the identity). Order inside the lists does not
// matter. It is computed on read and never persisted.
func (p *Permission) ComputeContentHash() string {
	payload := struct {
		Owner        string   `json:"owner"`
		Name         string   `json:"name"`
		Model        string   `json:"model"`
		Adapter      string   `json:"adapter"`
		ResourceType string   `json:"resourceType"`
		Effect       string   `json:"effect"`
		IsEnabled    bool     `json:"isEnabled"`
		Users        []string `json:"users"`
		Groups       []string `json:"groups"`
		Roles        []string `json:"roles"`
		Domains      []string `json:"domains"`
		Resources    []string `json:"resources"`
		Actions      []string `json:"actions"`
	}{
		p.Owner, p.Name, p.Model, p.Adapter, p.ResourceType, p.Effect, p.IsEnabled,
		sortedCopy(p.Users), sortedCopy(p.Groups), sortedCopy(p.Roles),
		sortedCopy(p.Domains), sortedCopy(p.Resources), sortedCopy(p.Actions),
	}
	data, _ := json.Marshal(payload)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// FillPermissionContentHash sets the computed ContentHash on each permission.
func FillPermissionContentHash(permissions ...*Permission) {
	for _, permission := range permissions {
		if permission != nil {
			permission.ContentHash = permission.ComputeContentHash()
		}
	}
}

// checkPermissionContentHash enforces that the content being approved/rejected is the content the
// reviewer saw. Approving requires a hash; rejecting verifies it only when one is supplied.
func checkPermissionContentHash(permission *Permission, to, contentHash string) error {
	if contentHash == "" {
		if to == PermissionStateApproved {
			return &PermissionValidationError{PermissionErrHashRequired}
		}
		return nil
	}
	if permission.ComputeContentHash() != contentHash {
		return &PermissionValidationError{PermissionErrContentChanged}
	}
	return nil
}
