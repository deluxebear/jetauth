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
	"database/sql"
	"fmt"
	"strings"

	"github.com/deluxebear/jetauth/util"
)

// lookupColumn returns the value of a result column, falling back to a case-insensitive match
// because some databases (Oracle, Postgres) fold identifier case.
func lookupColumn(row map[string]sql.NullString, name string) string {
	if v, ok := row[name]; ok {
		return v.String
	}
	for k, v := range row {
		if strings.EqualFold(k, name) {
			return v.String
		}
	}
	return ""
}

func (p *DatabaseSyncerProvider) quoteTable(name string) string {
	if p.Syncer.DatabaseType == "mssql" {
		return fmt.Sprintf("[%s]", name)
	}
	return name
}

// originalGroupFromRow maps a row of the group table to an OriginalGroup according to
// GroupTableColumns (Name = database column, CasdoorName = Id / Name / DisplayName / Description /
// Type / Manager / Email). It returns nil when the row has no usable name.
func (p *DatabaseSyncerProvider) originalGroupFromRow(row map[string]sql.NullString) *OriginalGroup {
	group := &OriginalGroup{}
	for _, column := range p.Syncer.GroupTableColumns {
		value := lookupColumn(row, column.Name)
		switch column.CasdoorName {
		case "Id":
			group.Id = value
		case "Name":
			group.Name = value
		case "DisplayName":
			group.DisplayName = value
		case "Description":
			group.Description = value
		case "Type":
			group.Type = value
		case "Manager":
			group.Manager = value
		case "Email":
			group.Email = value
		}
	}

	if group.Name == "" {
		group.Name = group.Id
	}
	if group.Id == "" {
		group.Id = group.Name
	}
	if group.Name == "" {
		return nil
	}
	if group.DisplayName == "" {
		group.DisplayName = group.Name
	}
	if group.Type == "" {
		group.Type = "Virtual"
	}

	return group
}

// GetOriginalGroups retrieves all groups from the configured group table. Nothing is returned when
// no group table is configured (group sync is opt-in for the generic Database syncer).
func (p *DatabaseSyncerProvider) GetOriginalGroups() ([]*OriginalGroup, error) {
	if p.Syncer.GroupTable == "" {
		return []*OriginalGroup{}, nil
	}

	if !util.FilterSQLIdentifier(p.Syncer.GroupTable) {
		return nil, fmt.Errorf("invalid group table name: %s", p.Syncer.GroupTable)
	}
	if len(p.Syncer.GroupTableColumns) == 0 {
		return nil, fmt.Errorf("the group table columns should not be empty")
	}
	if p.Syncer.Ormer == nil {
		if err := p.InitAdapter(); err != nil {
			return nil, err
		}
	}

	var results []map[string]sql.NullString
	err := p.Syncer.Ormer.Engine.Table(p.quoteTable(p.Syncer.GroupTable)).Find(&results)
	if err != nil {
		return nil, err
	}

	groups := []*OriginalGroup{}
	for _, row := range results {
		if group := p.originalGroupFromRow(row); group != nil {
			groups = append(groups, group)
		}
	}

	return groups, nil
}

// membershipFromRows converts membership rows to user key -> group names. Group ids are translated
// to group names through groupNameById; when no group table is configured (nil map) the raw group
// value is used as the group name, otherwise rows with unknown groups are skipped.
func (p *DatabaseSyncerProvider) membershipFromRows(rows []map[string]sql.NullString, groupNameById map[string]string) map[string][]string {
	res := map[string][]string{}
	for _, row := range rows {
		userKey := lookupColumn(row, p.Syncer.GroupMembershipUserColumn)
		groupName := lookupColumn(row, p.Syncer.GroupMembershipGroupColumn)

		if groupNameById != nil {
			name, ok := groupNameById[groupName]
			if !ok {
				continue
			}
			groupName = name
		}

		addUserToGroupMap(res, userKey, groupName)
	}

	return res
}

// getGroupMembership reads the membership table and returns user key -> group names.
func (p *DatabaseSyncerProvider) getGroupMembership() (map[string][]string, error) {
	if !util.FilterSQLIdentifier(p.Syncer.GroupMembershipTable) {
		return nil, fmt.Errorf("invalid group membership table name: %s", p.Syncer.GroupMembershipTable)
	}
	if p.Syncer.GroupMembershipUserColumn == "" || p.Syncer.GroupMembershipGroupColumn == "" {
		return nil, fmt.Errorf("the group membership user column and group column are required")
	}

	var groupNameById map[string]string
	if p.Syncer.GroupTable != "" {
		groups, err := p.GetOriginalGroups()
		if err != nil {
			return nil, err
		}
		groupNameById = map[string]string{}
		for _, g := range groups {
			groupNameById[g.Id] = g.Name
		}
	}

	if p.Syncer.Ormer == nil {
		if err := p.InitAdapter(); err != nil {
			return nil, err
		}
	}

	var rows []map[string]sql.NullString
	err := p.Syncer.Ormer.Engine.Table(p.quoteTable(p.Syncer.GroupMembershipTable)).Find(&rows)
	if err != nil {
		return nil, err
	}

	return p.membershipFromRows(rows, groupNameById), nil
}

// attachConfiguredGroupMembership fills OriginalUser.Groups from the configured membership table.
// The membership user column is matched against the value of the syncer's key column of the user.
func (p *DatabaseSyncerProvider) attachConfiguredGroupMembership(users []*OriginalUser) error {
	if p.Syncer.GroupMembershipTable == "" || len(p.Syncer.TableColumns) == 0 {
		return nil
	}

	membership, err := p.getGroupMembership()
	if err != nil {
		return fmt.Errorf("failed to read group membership: %w", err)
	}

	key := p.Syncer.getLocalPrimaryKey()
	for _, user := range users {
		user.Groups = []string{}
		if groups, ok := membership[p.Syncer.getUserValue(user, key)]; ok {
			user.Groups = groups
		}
	}

	return nil
}

// GetOriginalUserGroups retrieves the group names a user belongs to, according to the configured
// membership table. userId is the value of the syncer's key column.
func (p *DatabaseSyncerProvider) GetOriginalUserGroups(userId string) ([]string, error) {
	if p.Syncer.GroupMembershipTable == "" {
		return []string{}, nil
	}

	membership, err := p.getGroupMembership()
	if err != nil {
		return nil, err
	}

	groups := membership[userId]
	if groups == nil {
		groups = []string{}
	}

	return groups, nil
}
