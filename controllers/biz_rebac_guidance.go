// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package controllers

import (
	"encoding/json"
	"net/http"
)

// reBACOperationsGuideURL is echoed in the "docsUrl" field of the guidance
// error payload. It's a repo-relative path to the operator docs in this
// codebase (docs/rebac-operations-guide.md). Clients decide how to render
// it — e.g. admin UIs can map "/docs/..." to a bundled markdown renderer
// route; SDK users treat it as a documentation reference.
const reBACOperationsGuideURL = "/docs/rebac-operations-guide.md"

// writeNotSupportedInReBAC emits the spec §7.2 "BIZ_API_NOT_SUPPORTED_IN_REBAC"
// guidance error: HTTP 400 + JSON body telling the caller which ReBAC endpoint
// to use instead. Called from handlers whose semantics only exist in Casbin
// (e.g. "list all roles a user has" — ReBAC has no role concept at this tier).
//
// Design decision (TODO "ReBAC-mode adaptation of biz-get-user-roles /
// biz-get-user-permissions"): these endpoints intentionally stay unsupported
// in ReBAC mode rather than being adapted. Their contract is "which role names
// / (object, action) policies does this user hold across the app", which has
// no ReBAC equivalent: there is no role entity, and the only enumeration
// primitive is ListObjects/ListUsers, which requires a concrete
// (objectType, relation) pair these endpoints do not take. Synthesising an
// answer would mean scanning every (type, relation) in the schema, and the
// result would be a different shape with different semantics (derived
// accessibility, not granted policy rows) that SDK callers could silently
// misread. Returning the explicit guidance error pointing at
// /api/biz-list-objects (or /api/biz-check) is the safe behaviour.
//
// suggestUse is the ReBAC-native endpoint path the caller should hit instead,
// e.g. "/api/biz-list-objects" or "/api/biz-check".
func writeNotSupportedInReBAC(w http.ResponseWriter, suggestUse string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status": "error",
		"msg":    "BIZ_API_NOT_SUPPORTED_IN_REBAC",
		"data": map[string]any{
			"suggestUse": suggestUse,
			"docsUrl":    reBACOperationsGuideURL,
		},
	})
}
