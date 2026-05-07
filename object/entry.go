// Copyright 2026 The Casdoor Authors. All Rights Reserved.
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

	"github.com/deluxebear/jetauth/util"
	"github.com/xorm-io/core"
	"github.com/xorm-io/xorm"
)

type Entry struct {
	Owner       string `xorm:"varchar(100) notnull pk" json:"owner"`
	Name        string `xorm:"varchar(100) notnull pk" json:"name"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	UpdatedTime string `xorm:"varchar(100)" json:"updatedTime"`
	DisplayName string `xorm:"varchar(100)" json:"displayName"`

	Provider    string `xorm:"varchar(100)" json:"provider"`
	Application string `xorm:"varchar(100)" json:"application"`

	Type      string `xorm:"varchar(100)" json:"type"`
	ClientIp  string `xorm:"varchar(100)" json:"clientIp"`
	UserAgent string `xorm:"varchar(500)" json:"userAgent"`
	Message   string `xorm:"mediumtext" json:"message"`
}

func GetEntries(owner string) ([]*Entry, error) {
	entries := []*Entry{}
	err := ormer.Engine.Desc("created_time").Find(&entries, &Entry{Owner: owner})
	if err != nil {
		return nil, err
	}

	return entries, nil
}

func getEntry(owner string, name string) (*Entry, error) {
	entry := Entry{Owner: owner, Name: name}
	existed, err := ormer.Engine.Get(&entry)
	if err != nil {
		return nil, err
	}

	if existed {
		return &entry, nil
	}
	return nil, nil
}

func GetEntry(id string) (*Entry, error) {
	owner, name := util.GetOwnerAndNameFromIdNoCheck(id)
	return getEntry(owner, name)
}

func UpdateEntry(id string, entry *Entry) (bool, error) {
	owner, name := util.GetOwnerAndNameFromIdNoCheck(id)
	if e, err := getEntry(owner, name); err != nil {
		return false, err
	} else if e == nil {
		return false, nil
	}

	entry.UpdatedTime = util.GetCurrentTime()

	_, err := ormer.Engine.ID(core.PK{owner, name}).AllCols().Update(entry)
	if err != nil {
		return false, err
	}

	return true, nil
}

func AddEntry(entry *Entry) (bool, error) {
	affected, err := ormer.Engine.Insert(entry)
	if err != nil {
		return false, err
	}

	return affected != 0, nil
}

func DeleteEntry(entry *Entry) (bool, error) {
	affected, err := ormer.Engine.ID(core.PK{entry.Owner, entry.Name}).Delete(&Entry{})
	if err != nil {
		return false, err
	}

	return affected != 0, nil
}

func (entry *Entry) GetId() string {
	return fmt.Sprintf("%s/%s", entry.Owner, entry.Name)
}

func GetEntryCount(owner, field, value string) (int64, error) {
	session := GetSession(owner, -1, -1, field, value, "", "")
	return session.Count(&Entry{})
}

func GetPaginationEntries(owner string, offset, limit int, field, value, sortField, sortOrder string) ([]*Entry, error) {
	entries := []*Entry{}
	session := GetSession(owner, offset, limit, field, value, sortField, sortOrder)
	err := session.Find(&entries)
	if err != nil {
		return entries, err
	}

	return entries, nil
}

// EntryFilter narrows entry queries beyond the single-column LIKE that
// GetSession already supports. All fields are optional; an empty filter
// produces the same query as the un-filtered helpers above. The fields
// are applied with AND between them; multiple Types are OR'd within.
//
// StartTime / EndTime are compared against created_time as strings — that
// works because util.GetCurrentTime emits ISO-style "YYYY-MM-DDTHH:mm:ss…"
// which sorts lexicographically. Pass either bound empty to leave it open.
type EntryFilter struct {
	Types       []string
	Provider    string
	Application string
	StartTime   string
	EndTime     string
}

// IsEmpty reports whether the filter would impose any extra constraint —
// callers can short-circuit to the legacy un-filtered functions when so.
func (f EntryFilter) IsEmpty() bool {
	return len(f.Types) == 0 &&
		f.Provider == "" &&
		f.Application == "" &&
		f.StartTime == "" &&
		f.EndTime == ""
}

func applyEntryFilter(session *xorm.Session, f EntryFilter) *xorm.Session {
	if len(f.Types) > 0 {
		// Use IN() so the index on `type` can be used; xorm builds (?, ?, ?)
		// for us when we pass a slice.
		args := make([]interface{}, len(f.Types))
		for i, v := range f.Types {
			args[i] = v
		}
		session = session.In("type", args...)
	}
	if f.Provider != "" {
		session = session.And("provider = ?", f.Provider)
	}
	if f.Application != "" {
		session = session.And("application = ?", f.Application)
	}
	if f.StartTime != "" {
		session = session.And("created_time >= ?", f.StartTime)
	}
	if f.EndTime != "" {
		session = session.And("created_time <= ?", f.EndTime)
	}
	return session
}

// GetEntryCountFiltered counts entries matching the legacy single-column
// LIKE filter AND the structured filter. Used together with
// GetPaginationEntriesFiltered so total + page rows agree.
func GetEntryCountFiltered(owner, field, value string, f EntryFilter) (int64, error) {
	session := GetSession(owner, -1, -1, field, value, "", "")
	session = applyEntryFilter(session, f)
	return session.Count(&Entry{})
}

// GetPaginationEntriesFiltered is the structured-filter variant of
// GetPaginationEntries. Falls back to the simpler helper when the filter
// is empty, so the un-filtered hot path stays untouched.
func GetPaginationEntriesFiltered(owner string, offset, limit int, field, value, sortField, sortOrder string, f EntryFilter) ([]*Entry, error) {
	if f.IsEmpty() {
		return GetPaginationEntries(owner, offset, limit, field, value, sortField, sortOrder)
	}
	entries := []*Entry{}
	session := GetSession(owner, offset, limit, field, value, sortField, sortOrder)
	session = applyEntryFilter(session, f)
	err := session.Find(&entries)
	if err != nil {
		return entries, err
	}
	return entries, nil
}
