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

import "fmt"

// KeycloakSyncerProvider implements SyncerProvider for Keycloak database syncers
// Keycloak syncer extends DatabaseSyncerProvider with special handling for Keycloak schema
type KeycloakSyncerProvider struct {
	DatabaseSyncerProvider
}

// GetOriginalUsers retrieves all users from Keycloak database
// This method overrides the base implementation to handle Keycloak-specific logic
func (p *KeycloakSyncerProvider) GetOriginalUsers() ([]*OriginalUser, error) {
	// Use the base database implementation
	users, err := p.DatabaseSyncerProvider.GetOriginalUsers()
	if err != nil {
		return nil, err
	}

	// Group membership is nil (unknown) when it cannot be read, so existing memberships are not wiped
	membership, err := p.getKeycloakMembership()
	if err != nil {
		fmt.Printf("Warning: failed to read Keycloak group membership: %v. Group membership will not be synced.\n", err)
		for _, user := range users {
			user.Groups = nil
		}
		return users, nil
	}

	for _, user := range users {
		user.Groups = []string{}
		if groups, ok := membership[user.Id]; ok {
			user.Groups = groups
		}
	}

	return users, nil
}

// Note: Keycloak-specific user mapping is handled in syncer_util.go
// via getOriginalUsersFromMap which checks syncer.Type == "Keycloak"

// GetOriginalGroups retrieves all groups from the Keycloak keycloak_group table. Keycloak group names
// are only unique within their parent, so the group id is used as the unique group name and the
// Keycloak group name is the display name.
func (p *KeycloakSyncerProvider) GetOriginalGroups() ([]*OriginalGroup, error) {
	if p.Syncer.Ormer == nil {
		if err := p.InitAdapter(); err != nil {
			return nil, err
		}
	}

	rows, err := p.Syncer.Ormer.Engine.QueryString("select id as gid, name as gname from keycloak_group")
	if err != nil {
		return nil, fmt.Errorf("failed to read Keycloak groups: %w", err)
	}

	return keycloakGroupsFromRows(rows), nil
}

func keycloakGroupsFromRows(rows []map[string]string) []*OriginalGroup {
	groups := []*OriginalGroup{}
	for _, row := range rows {
		id := row["gid"]
		if id == "" {
			continue
		}

		displayName := row["gname"]
		if displayName == "" {
			displayName = id
		}

		groups = append(groups, &OriginalGroup{
			Id:          id,
			Name:        id,
			DisplayName: displayName,
			Type:        "Virtual",
		})
	}

	return groups
}

// getKeycloakMembership reads user_group_membership and returns user id -> group names.
func (p *KeycloakSyncerProvider) getKeycloakMembership() (map[string][]string, error) {
	if p.Syncer.Ormer == nil {
		if err := p.InitAdapter(); err != nil {
			return nil, err
		}
	}

	rows, err := p.Syncer.Ormer.Engine.QueryString("select user_id as uid, group_id as gid from user_group_membership")
	if err != nil {
		return nil, err
	}

	res := map[string][]string{}
	for _, row := range rows {
		addUserToGroupMap(res, row["uid"], row["gid"])
	}

	return res, nil
}

// GetOriginalUserGroups retrieves the ids (group names) of the Keycloak groups a user is a member of.
func (p *KeycloakSyncerProvider) GetOriginalUserGroups(userId string) ([]string, error) {
	if p.Syncer.Ormer == nil {
		if err := p.InitAdapter(); err != nil {
			return nil, err
		}
	}

	rows, err := p.Syncer.Ormer.Engine.QueryString("select group_id as gid from user_group_membership where user_id = ?", userId)
	if err != nil {
		return nil, err
	}

	groupIds := []string{}
	for _, row := range rows {
		if row["gid"] != "" {
			groupIds = append(groupIds, row["gid"])
		}
	}

	return groupIds, nil
}
