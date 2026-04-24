package object

import (
	"errors"
	"testing"
)

func TestParseReBACEnforceRequest_Valid(t *testing.T) {
	tuple, err := parseReBACEnforceRequest([]any{"document:d1", "viewer", "user:alice"})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if tuple.Object != "document:d1" || tuple.Relation != "viewer" || tuple.User != "user:alice" {
		t.Errorf("unexpected tuple: %+v", tuple)
	}
}

func TestParseReBACEnforceRequest_WrongArity(t *testing.T) {
	_, err := parseReBACEnforceRequest([]any{"a", "b"})
	if !errors.Is(err, errBadReBACArity) {
		t.Errorf("expected errBadReBACArity, got %v", err)
	}
}

func TestParseReBACEnforceRequest_Nil(t *testing.T) {
	_, err := parseReBACEnforceRequest(nil)
	if !errors.Is(err, errBadReBACArity) {
		t.Errorf("expected errBadReBACArity on nil input, got %v", err)
	}
}

func TestParseReBACEnforceRequest_NotString(t *testing.T) {
	_, err := parseReBACEnforceRequest([]any{42, "b", "c"})
	if !errors.Is(err, errBadReBACElement) {
		t.Errorf("expected errBadReBACElement, got %v", err)
	}
}

func TestParseReBACEnforceRequest_NoTypePrefix(t *testing.T) {
	_, err := parseReBACEnforceRequest([]any{"alice", "viewer", "user:alice"})
	if !errors.Is(err, errBadReBACObject) {
		t.Errorf("expected errBadReBACObject, got %v", err)
	}
}

func TestDispatchEnforceIfReBAC_NilConfig(t *testing.T) {
	allowed, kind, handled, err := dispatchEnforceIfReBAC(nil, []any{"doc:1", "viewer", "user:a"})
	if handled || allowed || kind != "" || err != nil {
		t.Errorf("nil config must fall through, got allowed=%v kind=%v handled=%v err=%v",
			allowed, kind, handled, err)
	}
}

func TestDispatchEnforceIfReBAC_NonReBACModelType(t *testing.T) {
	cfg := &BizAppConfig{ModelType: "casbin"}
	_, _, handled, _ := dispatchEnforceIfReBAC(cfg, []any{"doc:1", "viewer", "user:a"})
	if handled {
		t.Error("casbin apps must fall through (handled=false)")
	}
	cfg.ModelType = ""
	_, _, handled, _ = dispatchEnforceIfReBAC(cfg, []any{"doc:1", "viewer", "user:a"})
	if handled {
		t.Error("empty ModelType must fall through")
	}
}

func TestDispatchEnforceIfReBAC_MalformedInput(t *testing.T) {
	cfg := &BizAppConfig{ModelType: ModelTypeReBAC, Owner: "x", AppName: "y"}
	_, kind, handled, err := dispatchEnforceIfReBAC(cfg, []any{"a", "b"})
	if !handled || kind != BizAuthzKindBadRequest || err == nil {
		t.Errorf("malformed input expected handled=true kind=bad_request err!=nil, got handled=%v kind=%v err=%v",
			handled, kind, err)
	}
}
