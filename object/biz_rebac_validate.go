// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import "fmt"

// SchemaConflict describes a single tuple that would be orphaned by the
// candidate schema. Returned to the API caller so the UI can list exactly
// which tuples need to be cleaned up before the schema change can proceed.
// See docs/rebac-spec.md §4.2 "schema 变更前的 tuple 校验" (OQ-3 "拒绝保存并返回冲突列表").
type SchemaConflict struct {
	TupleId  int64  `json:"tupleId"`
	Object   string `json:"object"`
	Relation string `json:"relation"`
	User     string `json:"user"`
	Reason   string `json:"reason"`
}

// FindSchemaConflicts scans tuples against the relation-key and type allowlists
// extracted from the new schema. Type-level removals take precedence over
// relation-level removals: if the tuple's object type is gone we only report
// the type removal (reporting both would duplicate the signal).
//
// Empty newSchemaTypes disables the type check (useful for tests); an empty
// newSchemaRelationKeys with non-empty types still runs the relation check
// (every relation is "missing").
func FindSchemaConflicts(tuples []*BizTuple, newSchemaRelationKeys []string, newSchemaTypes []string) []SchemaConflict {
	if len(tuples) == 0 {
		return nil
	}
	typeSet := make(map[string]bool, len(newSchemaTypes))
	for _, t := range newSchemaTypes {
		typeSet[t] = true
	}
	keySet := make(map[string]bool, len(newSchemaRelationKeys))
	for _, k := range newSchemaRelationKeys {
		keySet[k] = true
	}

	var out []SchemaConflict
	for _, t := range tuples {
		if len(typeSet) > 0 && !typeSet[t.ObjectType] {
			out = append(out, SchemaConflict{
				TupleId:  t.Id,
				Object:   t.Object,
				Relation: t.Relation,
				User:     t.User,
				Reason:   fmt.Sprintf("type %s no longer exists", t.ObjectType),
			})
			continue
		}
		key := t.ObjectType + "#" + t.Relation
		if !keySet[key] {
			out = append(out, SchemaConflict{
				TupleId:  t.Id,
				Object:   t.Object,
				Relation: t.Relation,
				User:     t.User,
				Reason:   fmt.Sprintf("relation %s no longer exists", key),
			})
		}
	}
	return out
}

// ScanSchemaConflictsForApp is the DB-backed wrapper that wires
// FindSchemaConflicts to an actual store + candidate schema. API handlers
// (biz-write-authorization-model) call this; pure-function tests call
// FindSchemaConflicts directly for faster feedback.
func ScanSchemaConflictsForApp(owner, appName string, candidate *ParsedSchema) ([]SchemaConflict, error) {
	if candidate == nil {
		return nil, fmt.Errorf("candidate schema is nil")
	}
	tuples, err := ListBizTuplesForApp(owner, appName)
	if err != nil {
		return nil, fmt.Errorf("list tuples: %w", err)
	}
	return FindSchemaConflicts(
		tuples,
		ExtractRelationKeys(candidate.Proto),
		ExtractTypeNames(candidate.Proto),
	), nil
}
