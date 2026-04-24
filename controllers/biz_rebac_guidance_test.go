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
	"net/http/httptest"
	"testing"
)

func TestWriteNotSupportedInReBAC_Shape(t *testing.T) {
	rec := httptest.NewRecorder()
	writeNotSupportedInReBAC(rec, "/api/biz-list-objects")

	if rec.Code != 400 {
		t.Errorf("expected 400, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("expected JSON content-type, got %q", ct)
	}

	var body struct {
		Status string `json:"status"`
		Msg    string `json:"msg"`
		Data   struct {
			SuggestUse string `json:"suggestUse"`
			DocsUrl    string `json:"docsUrl"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body.Status != "error" {
		t.Errorf("status=%q, want error", body.Status)
	}
	if body.Msg != "BIZ_API_NOT_SUPPORTED_IN_REBAC" {
		t.Errorf("msg=%q, want BIZ_API_NOT_SUPPORTED_IN_REBAC", body.Msg)
	}
	if body.Data.SuggestUse != "/api/biz-list-objects" {
		t.Errorf("suggestUse=%q", body.Data.SuggestUse)
	}
	if body.Data.DocsUrl == "" {
		t.Error("docsUrl must be non-empty")
	}
}

func TestWriteNotSupportedInReBAC_EchoesSuggestUse(t *testing.T) {
	rec := httptest.NewRecorder()
	writeNotSupportedInReBAC(rec, "/api/biz-check")

	var body struct {
		Data struct {
			SuggestUse string `json:"suggestUse"`
		} `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body.Data.SuggestUse != "/api/biz-check" {
		t.Errorf("helper must echo caller-passed suggestUse, got %q", body.Data.SuggestUse)
	}
}
