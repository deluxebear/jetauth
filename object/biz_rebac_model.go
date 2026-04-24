// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"github.com/deluxebear/jetauth/util"
)

// BizAuthorizationModel stores a single immutable snapshot of an OpenFGA-compatible
// authorization schema (DSL + JSON representation) for a given application.
//
// Per spec §4.2 "永远不 UPDATE 或 DELETE individual model rows": this table is
// append-only. Historical models are preserved so that tuple writes and checks
// that reference a past model_id remain auditable. The only sanctioned delete
// path is DeleteBizAuthorizationModelsForApp, which removes ALL models for an
// app as part of a cascading app teardown.
type BizAuthorizationModel struct {
	Id          string `xorm:"varchar(40) pk" json:"id"`
	Owner       string `xorm:"varchar(100) notnull index(idx_store)" json:"owner"`
	AppName     string `xorm:"varchar(100) notnull index(idx_store)" json:"appName"`
	SchemaDSL   string `xorm:"mediumtext" json:"schemaDsl"`
	SchemaJSON  string `xorm:"mediumtext" json:"schemaJson"`
	SchemaHash  string `xorm:"varchar(64) index" json:"schemaHash"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	CreatedBy   string `xorm:"varchar(200)" json:"createdBy"`
}

// GetId returns the primary-key string for the model. Satisfies the JetAuth
// entity interface used by generic controller helpers.
func (m *BizAuthorizationModel) GetId() string {
	return m.Id
}

// computeSchemaHash returns the lowercase hex-encoded SHA-256 digest of the
// raw DSL bytes. Using the DSL (not the JSON) as the canonical input keeps the
// hash stable across JSON re-serialisations that may reorder keys.
// The 64-character hex output maps directly to the SchemaHash column
// (varchar(64)).
func computeSchemaHash(dsl string) string {
	sum := sha256.Sum256([]byte(dsl))
	return hex.EncodeToString(sum[:])
}

// AddBizAuthorizationModel inserts a new, immutable authorization model row.
// It auto-assigns Id (UUID v4) when the caller leaves it empty, and
// auto-computes SchemaHash from SchemaDSL when left empty.
//
// There is no UpdateBizAuthorizationModel — see spec §4.2. Callers who want
// to "change" the schema must call AddBizAuthorizationModel again and update
// BizAppConfig.CurrentAuthorizationModelId to point at the new row.
func AddBizAuthorizationModel(m *BizAuthorizationModel) (bool, error) {
	if m.Id == "" {
		m.Id = util.GenerateUUID()
	}
	if m.SchemaHash == "" {
		m.SchemaHash = computeSchemaHash(m.SchemaDSL)
	}
	affected, err := ormer.Engine.Insert(m)
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}

// GetBizAuthorizationModel retrieves a single model by its primary key.
// Returns (nil, nil) for empty id or a row that no longer exists, so callers
// can distinguish "missing" from a real DB error without an errors.Is dance.
func GetBizAuthorizationModel(id string) (*BizAuthorizationModel, error) {
	if id == "" {
		return nil, nil
	}
	m := BizAuthorizationModel{Id: id}
	existed, err := ormer.Engine.Get(&m)
	if err != nil {
		return nil, err
	}
	if !existed {
		return nil, nil
	}
	return &m, nil
}

// FindLatestBizAuthorizationModelByHash looks up the most-recently-created model
// for (owner, appName) whose SchemaDSL hashes to hash. This is used by the
// save-path idempotence check (spec §4.3): if the proposed DSL is identical to
// an existing model for this app, return the existing model instead of inserting
// a duplicate.
//
// Returns (nil, nil) when no matching row exists.
func FindLatestBizAuthorizationModelByHash(owner, appName, hash string) (*BizAuthorizationModel, error) {
	if owner == "" || appName == "" || hash == "" {
		return nil, fmt.Errorf("owner, appName and hash are all required")
	}
	models := []*BizAuthorizationModel{}
	err := ormer.Engine.
		Where("owner = ? AND app_name = ? AND schema_hash = ?", owner, appName, hash).
		Desc("created_time").
		Limit(1).
		Find(&models)
	if err != nil {
		return nil, err
	}
	if len(models) == 0 {
		return nil, nil
	}
	return models[0], nil
}

// ListBizAuthorizationModels returns all models stored for (owner, appName),
// newest first. The list is intentionally unbounded — model rows are small
// (mostly text hashes) and the count is bounded by how often an admin changes
// the schema, which is expected to be infrequent.
func ListBizAuthorizationModels(owner, appName string) ([]*BizAuthorizationModel, error) {
	models := []*BizAuthorizationModel{}
	err := ormer.Engine.
		Where("owner = ? AND app_name = ?", owner, appName).
		Desc("created_time").
		Find(&models)
	if err != nil {
		return nil, err
	}
	return models, nil
}

// DeleteBizAuthorizationModelsForApp is THE ONLY delete path for authorization
// model rows (spec §13 Never: "提供 DeleteBizAuthorizationModel API 或前端删除入口").
//
// It removes ALL models for the given (owner, appName) — it is called
// exclusively as a cascade from DeleteBizAppConfig when an entire application
// is torn down. Individual model rows are never exposed to single-row deletion.
func DeleteBizAuthorizationModelsForApp(owner, appName string) (int64, error) {
	affected, err := ormer.Engine.
		Where("owner = ? AND app_name = ?", owner, appName).
		Delete(&BizAuthorizationModel{})
	if err != nil {
		return 0, err
	}
	return affected, nil
}

// SaveAuthorizationModelOutcome distinguishes the three outcomes of a
// schema-save call so the HTTP layer can return the right response shape
// without sniffing error strings.
type SaveAuthorizationModelOutcome string

const (
	// Same DSL bytes as the current model — no-op, no insert.
	SaveOutcomeUnchanged SaveAuthorizationModelOutcome = "unchanged"
	// New row inserted, App's CurrentAuthorizationModelId advanced.
	SaveOutcomeAdvanced SaveAuthorizationModelOutcome = "advanced"
	// Candidate schema drops types/relations still referenced by tuples;
	// no insert, caller must clean up tuples first.
	SaveOutcomeConflict SaveAuthorizationModelOutcome = "conflict"
)

// SaveAuthorizationModelResult bundles the outcome with the resulting
// model id (on advance / unchanged) or the conflict list (on conflict).
// SchemaJSON is populated on unchanged/advanced so the admin UI's
// visual editor can ingest the parsed model without a second request.
type SaveAuthorizationModelResult struct {
	Outcome              SaveAuthorizationModelOutcome `json:"outcome"`
	AuthorizationModelId string                        `json:"authorizationModelId,omitempty"`
	SchemaJSON           string                        `json:"schemaJson,omitempty"`
	Conflicts            []SchemaConflict              `json:"conflicts,omitempty"`
}

// evaluateAuthorizationModel is the shared pipeline behind
// ValidateAuthorizationModel and SaveAuthorizationModel: verify app
// exists → parse DSL → hash-match short-circuit → conflict scan. It
// returns one of:
//
//   - (result=unchanged, parsed=<ignored>, nil)   — DSL already stored.
//   - (result=conflict,  parsed=<ignored>, nil)   — destructive change.
//   - (result=nil,       parsed=<clean>,   nil)   — safe to advance;
//     caller decides
//     whether to insert.
//   - (nil, nil, err) on any pipeline error.
//
// Keeping this private to the package preserves the public API of
// Save/Validate while guaranteeing the two paths can never drift on
// validation semantics (post-review I2).
func evaluateAuthorizationModel(owner, appName, dsl string) (*SaveAuthorizationModelResult, *ParsedSchema, error) {
	if _, err := getBizAppConfigOrError(owner, appName); err != nil {
		return nil, nil, err
	}

	parsed, err := ParseSchemaDSL(dsl)
	if err != nil {
		return nil, nil, fmt.Errorf("schema parse: %w", err)
	}

	hash := computeSchemaHash(dsl)
	if existing, err := FindLatestBizAuthorizationModelByHash(owner, appName, hash); err != nil {
		return nil, nil, fmt.Errorf("lookup by hash: %w", err)
	} else if existing != nil {
		return &SaveAuthorizationModelResult{
			Outcome:              SaveOutcomeUnchanged,
			AuthorizationModelId: existing.Id,
			SchemaJSON:           existing.SchemaJSON,
		}, nil, nil
	}

	conflicts, err := ScanSchemaConflictsForApp(owner, appName, parsed)
	if err != nil {
		return nil, nil, fmt.Errorf("scan conflicts: %w", err)
	}
	if len(conflicts) > 0 {
		return &SaveAuthorizationModelResult{
			Outcome:   SaveOutcomeConflict,
			Conflicts: conflicts,
		}, nil, nil
	}

	return nil, parsed, nil
}

// ValidateAuthorizationModel runs the shared validation pipeline
// without inserting a row or advancing the app pointer. It is the
// backing call for the admin UI's dry-run DSL editor (spec §8.2 "DSL
// 编辑器实时校验"). The result mirrors what a real save *would* return
// so the frontend can render the same three outcomes without a
// separate error channel:
//   - unchanged: DSL matches the latest model already on disk.
//   - advanced:  DSL is new and would produce a clean insert.
//   - conflict:  DSL drops types/relations still referenced by tuples;
//     the Conflicts list tells the admin what to clean up.
func ValidateAuthorizationModel(owner, appName, dsl string) (*SaveAuthorizationModelResult, error) {
	done, parsed, err := evaluateAuthorizationModel(owner, appName, dsl)
	if err != nil {
		return nil, err
	}
	if done != nil {
		return done, nil
	}
	return &SaveAuthorizationModelResult{
		Outcome:    SaveOutcomeAdvanced,
		SchemaJSON: parsed.JSON,
	}, nil
}

// SaveAuthorizationModel parses the DSL, scans for tuple conflicts, and
// (if clean) inserts a new model row + advances the app's pointer. Wraps
// the spec §4.2 "写入规则" as a single atomic op from the caller's
// perspective — the DB-level transaction boundary is per-statement, but
// since we never UPDATE or DELETE models, partial failure can only strand
// a model row that's never referenced (acceptable: §4.2 "永远不 UPDATE 或
// DELETE" invariant).
//
// PR2 note: compare-and-swap on the previous CurrentAuthorizationModelId
// will be added then; for PR1 the conflict scan already blocks the
// destructive-change race that matters most.
func SaveAuthorizationModel(owner, appName, dsl, createdBy string) (*SaveAuthorizationModelResult, error) {
	done, parsed, err := evaluateAuthorizationModel(owner, appName, dsl)
	if err != nil {
		return nil, err
	}
	if done != nil {
		// Unchanged or conflict — no row written.
		return done, nil
	}

	hash := computeSchemaHash(dsl)
	m := &BizAuthorizationModel{
		Owner:       owner,
		AppName:     appName,
		SchemaDSL:   dsl,
		SchemaJSON:  parsed.JSON,
		SchemaHash:  hash,
		CreatedTime: util.GetCurrentTime(),
		CreatedBy:   createdBy,
	}
	if _, err := AddBizAuthorizationModel(m); err != nil {
		return nil, fmt.Errorf("insert authorization model: %w", err)
	}

	// Advance only the pointer column — not via UpdateBizAppConfig, which
	// would (a) re-validate PolicyTable and (b) trigger syncBizPolicies, both
	// of which are Casbin-lane operations wasted on a ReBAC app (spec §13
	// Always: "Casbin 代码路径零修改").
	if _, err := SetBizAppConfigAuthorizationModelId(owner, appName, m.Id); err != nil {
		return nil, fmt.Errorf("advance current model pointer: %w", err)
	}

	// Schema advance may reclassify which tuples are admissible under
	// each relation's type restriction; the L2 tupleset cache's
	// pre-advance snapshot is no longer safe to serve. Flush the entire
	// store's cache entries (spec §6.6 "schema 切换时整 store flush").
	flushBizTuplesetCacheForStore(BuildStoreId(owner, appName))

	return &SaveAuthorizationModelResult{
		Outcome:              SaveOutcomeAdvanced,
		AuthorizationModelId: m.Id,
		SchemaJSON:           m.SchemaJSON,
	}, nil
}
