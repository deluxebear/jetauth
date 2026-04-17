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

	"github.com/deluxebear/casdoor/util"
)

// BizResourceImportApplyRequest is the body for biz-import-app-resources —
// the user's selection from the preview is passed back verbatim. The server
// re-validates each row to avoid trusting arbitrary client state.
type BizResourceImportApplyRequest struct {
	Owner   string                 `json:"owner"`
	AppName string                 `json:"appName"`
	Rows    []BizResourceImportRow `json:"rows"`
}

// BizResourceImportApplyResult reports per-row outcomes so the UI can
// highlight failures without losing the successes.
type BizResourceImportApplyResult struct {
	Added      int      `json:"added"`
	Updated    int      `json:"updated"`
	Deprecated int      `json:"deprecated"`
	Failed     int      `json:"failed"`
	Errors     []string `json:"errors,omitempty"`
}

// ImportBizAppResources applies a previously-previewed import. Each row is
// upserted by (Owner, AppName, Name). Errors on individual rows are
// collected and returned; the call does not short-circuit on the first one.
func ImportBizAppResources(req *BizResourceImportApplyRequest) (*BizResourceImportApplyResult, error) {
	if req.Owner == "" || req.AppName == "" {
		return nil, fmt.Errorf("owner and appName are required")
	}

	result := &BizResourceImportApplyResult{}
	now := util.GetCurrentTime()

	// Pre-fetch every existing row in the app once, then serve per-row
	// lookups from the map. Avoids N DB round-trips for a 50-row import.
	existingAll, err := ListBizAppResources(req.Owner, req.AppName)
	if err != nil {
		return nil, err
	}
	existingByName := make(map[string]*BizAppResource, len(existingAll))
	for _, r := range existingAll {
		existingByName[r.Name] = r
	}

	for i := range req.Rows {
		row := req.Rows[i]
		proposed := row.Proposed
		proposed.Owner = req.Owner
		proposed.AppName = req.AppName

		if err := validateBizAppResource(&proposed); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("row %d (%s): %s", i+1, proposed.Name, err.Error()))
			continue
		}

		existing := existingByName[proposed.Name]

		switch row.Kind {
		case "new", "update":
			if existing != nil {
				proposed.Id = existing.Id
				proposed.CreatedTime = existing.CreatedTime
				proposed.UpdatedTime = now
				if _, err := ormer.Engine.ID(existing.Id).AllCols().Update(&proposed); err != nil {
					result.Failed++
					result.Errors = append(result.Errors, fmt.Sprintf("row %d (%s): %s", i+1, proposed.Name, err.Error()))
					continue
				}
				result.Updated++
				// Keep the cache in sync so a later row with the same name
				// classifies correctly within this batch.
				snapshot := proposed
				existingByName[proposed.Name] = &snapshot
			} else {
				proposed.CreatedTime = now
				proposed.UpdatedTime = now
				if _, err := ormer.Engine.Insert(&proposed); err != nil {
					result.Failed++
					result.Errors = append(result.Errors, fmt.Sprintf("row %d (%s): %s", i+1, proposed.Name, err.Error()))
					continue
				}
				result.Added++
				snapshot := proposed
				existingByName[proposed.Name] = &snapshot
			}
		case "deprecated":
			if existing == nil {
				// Nothing to deprecate — skip silently.
				continue
			}
			existing.Deprecated = true
			existing.UpdatedTime = now
			if _, err := ormer.Engine.ID(existing.Id).Cols("deprecated", "updated_time").Update(existing); err != nil {
				result.Failed++
				result.Errors = append(result.Errors, fmt.Sprintf("row %d (%s): %s", i+1, existing.Name, err.Error()))
				continue
			}
			result.Deprecated++
		default:
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("row %d (%s): unsupported kind %q", i+1, proposed.Name, row.Kind))
		}
	}

	return result, nil
}
