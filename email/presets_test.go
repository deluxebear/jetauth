package email

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPresets_CloudflareRendersValidJSON(t *testing.T) {
	p, ok := FindPreset("cloudflare")
	if !ok {
		t.Fatal("cloudflare preset missing")
	}
	out, err := Render(p.BodyTemplate, p.ContentType, Context{
		FromAddress: "a@b.c", FromName: "A",
		ToAddress: "r@e.com", Subject: "s", Content: "<p>x</p>",
	})
	if err != nil {
		t.Fatal(err)
	}
	var v any
	if err := json.Unmarshal([]byte(out), &v); err != nil {
		t.Errorf("invalid JSON from cloudflare preset: %v\n%s", err, out)
	}
}

func TestPresets_AllKeysUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, p := range AllPresets() {
		if seen[p.Key] {
			t.Errorf("dup preset key %s", p.Key)
		}
		seen[p.Key] = true
		if !strings.Contains(p.EndpointExample, "://") {
			t.Errorf("preset %s endpoint must include scheme", p.Key)
		}
	}
}
