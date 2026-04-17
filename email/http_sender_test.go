package email

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHttpSender_JSONBody(t *testing.T) {
	var gotBody map[string]any
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Fatalf("unexpected Content-Type: %s", ct)
		}
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	s := &HttpEmailSender{
		Endpoint:     srv.URL,
		Method:       "POST",
		ContentType:  "application/json",
		HttpHeaders:  map[string]string{"Authorization": "Bearer T"},
		BodyTemplate: `{"from":"${fromAddress}","to":"${toAddress}","subject":"${subject}","html":"${content}"}`,
		Allowlist:    []string{"127.0.0.0/8"}, // allow httptest loopback
	}
	if err := s.Send("a@b.c", "Alice", []string{"rcpt@example.com"}, "Hi", "<p>Hello</p>"); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer T" {
		t.Errorf("header missing: %q", gotAuth)
	}
	if gotBody["from"] != "a@b.c" || gotBody["to"] != "rcpt@example.com" || gotBody["html"] != "<p>Hello</p>" {
		t.Errorf("body mismatch: %+v", gotBody)
	}
}

func TestHttpSender_ErrorPropagatesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"errors":[{"code":10001,"message":"bad"}]}`))
	}))
	defer srv.Close()

	s := &HttpEmailSender{
		Endpoint:     srv.URL,
		Method:       "POST",
		ContentType:  "application/json",
		BodyTemplate: `{"x":1}`,
		Allowlist:    []string{"127.0.0.0/8"}, // allow httptest loopback
	}
	err := s.Send("a@b.c", "A", []string{"r@e.com"}, "s", "c")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "10001") {
		t.Errorf("error body not included: %v", err)
	}
}
