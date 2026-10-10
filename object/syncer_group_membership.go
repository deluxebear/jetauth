// Copyright 2025 The Casdoor Authors. All Rights Reserved.
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
	"fmt"

	"github.com/xorm-io/core"
)

// providesGroupMembership reports whether the syncer type fills OriginalUser.Groups
// authoritatively, so that membership of already-synced users can be reconciled.
func (syncer *Syncer) providesGroupMembership() bool {
	switch syncer.Type {
	case "Azure AD", "Okta", "WeCom", "Lark", "SCIM", "AWS IAM", "Active Directory", "Keycloak":
		return true
	case "Database", "":
		return syncer.GroupMembershipTable != ""
	default:
		return false
	}
}

func sameStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	set := map[string]int{}
	for _, v := range a {
		set[v]++
	}
	for _, v := range b {
		set[v]--
	}
	for _, c := range set {
		if c != 0 {
			return false
		}
	}
	return true
}

// mergeSyncedGroups computes the new group list of a user: groups that the external
// system does not manage (locally assigned ones) are kept, groups known to the
// external system are replaced by the user's current remote membership.
func mergeSyncedGroups(localGroups []string, remoteGroups []string, knownRemote map[string]bool) []string {
	res := []string{}
	seen := map[string]bool{}
	for _, g := range localGroups {
		if !knownRemote[g] && !seen[g] {
			res = append(res, g)
			seen[g] = true
		}
	}
	for _, g := range remoteGroups {
		if !seen[g] {
			res = append(res, g)
			seen[g] = true
		}
	}
	return res
}

// syncGroupMemberships reconciles User.Groups of existing users with the membership
// reported by the external system. Users whose OriginalUser.Groups is nil (membership
// could not be determined) are left untouched. New users already carry their groups.
func (syncer *Syncer) syncGroupMemberships(oUsers []*OriginalUser, myUsers map[string]*User, key string) error {
	if !syncer.providesGroupMembership() {
		return nil
	}

	oGroups, err := syncer.getOriginalGroups()
	if err != nil {
		fmt.Printf("Warning: skip group membership reconciliation, failed to list groups: %v\n", err)
		return nil
	}

	knownRemote := map[string]bool{}
	for _, g := range oGroups {
		knownRemote[g.Name] = true
	}

	for _, oUser := range oUsers {
		if oUser.Groups == nil {
			continue
		}

		user, ok := myUsers[syncer.getUserValue(oUser, key)]
		if !ok {
			continue
		}

		newGroups := mergeSyncedGroups(user.Groups, oUser.Groups, knownRemote)
		if sameStringSet(user.Groups, newGroups) {
			continue
		}

		oldGroups := user.Groups
		_, err = userEnforcer.UpdateGroupsForUser(user.GetId(), newGroups)
		if err != nil {
			return err
		}

		// Only the groups column is written: touching hash/pre_hash here would
		// confuse the two-way user sync state machine.
		user.Groups = newGroups
		_, err = ormer.Engine.ID(core.PK{user.Owner, user.Name}).Cols("groups").Update(user)
		if err != nil {
			return err
		}

		SyncAfterUserGroupsChanged(user.Owner, userGroupsSymmetricDiff(oldGroups, newGroups))
	}

	return nil
}
