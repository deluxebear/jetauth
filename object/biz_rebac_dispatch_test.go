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
