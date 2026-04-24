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
