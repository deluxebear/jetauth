package object

import (
	"errors"
	"testing"
)

func TestParseReBACEnforceRequest_Valid(t *testing.T) {
	tuple, err := parseReBACEnforceRequest([]interface{}{"document:d1", "viewer", "user:alice"})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if tuple.Object != "document:d1" || tuple.Relation != "viewer" || tuple.User != "user:alice" {
		t.Errorf("unexpected tuple: %+v", tuple)
	}
}

func TestParseReBACEnforceRequest_WrongArity(t *testing.T) {
	_, err := parseReBACEnforceRequest([]interface{}{"a", "b"})
	if !errors.Is(err, errBadReBACArity) {
		t.Errorf("expected errBadReBACArity, got %v", err)
	}
}

func TestParseReBACEnforceRequest_NotString(t *testing.T) {
	_, err := parseReBACEnforceRequest([]interface{}{42, "b", "c"})
	if !errors.Is(err, errBadReBACElement) {
		t.Errorf("expected errBadReBACElement, got %v", err)
	}
}

func TestParseReBACEnforceRequest_NoTypePrefix(t *testing.T) {
	_, err := parseReBACEnforceRequest([]interface{}{"alice", "viewer", "user:alice"})
	if !errors.Is(err, errBadReBACObject) {
		t.Errorf("expected errBadReBACObject, got %v", err)
	}
}
