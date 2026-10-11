// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package object

import (
	"path/filepath"
	"testing"
)

func TestHashRows(t *testing.T) {
	cols := []string{"a", "b"}
	base := []map[string]string{{"a": "1", "b": "x"}, {"a": "2", "b": "y"}}
	h0 := hashRows(base, cols)

	reordered := []map[string]string{base[1], base[0]}
	if hashRows(reordered, cols) != h0 {
		t.Error("fingerprint must not depend on row order")
	}
	changed := []map[string]string{{"a": "1", "b": "x"}, {"a": "2", "b": "z"}}
	if hashRows(changed, cols) == h0 {
		t.Error("cell change must change the fingerprint")
	}
	// Field boundaries are delimited: ("ab","") must differ from ("a","b").
	if hashRows([]map[string]string{{"a": "ab", "b": ""}}, cols) == hashRows([]map[string]string{{"a": "a", "b": "b"}}, cols) {
		t.Error("field boundary collision")
	}
	if hashRows(base[:1], cols) == h0 {
		t.Error("row removal must change the fingerprint")
	}
}

func TestSiteFingerprintDetectsSameSecondEdits(t *testing.T) {
	prev := ormer
	a, err := NewAdapter("sqlite3", "file:"+filepath.Join(t.TempDir(), "fp.db"), "")
	if err != nil {
		t.Fatal(err)
	}
	ormer = a
	t.Cleanup(func() {
		ormer = prev
		_ = a.Engine.Close()
	})
	if err = a.Engine.Sync2(new(Site), new(Cert), new(Application)); err != nil {
		t.Fatal(err)
	}

	const ts = "2026-01-01T00:00:00Z" // identical timestamp: edits land in the same second
	if _, err = a.Engine.Insert(&Site{Owner: "admin", Name: "s1", CreatedTime: ts, UpdatedTime: ts, Domain: "a.example.com"}); err != nil {
		t.Fatal(err)
	}
	if _, err = a.Engine.Insert(&Cert{Owner: "admin", Name: "c1", CreatedTime: ts, Certificate: "CERT-1", ExpireTime: "2027"}); err != nil {
		t.Fatal(err)
	}
	if _, err = a.Engine.Insert(&Application{Owner: "admin", Name: "app1", CreatedTime: ts, ClientId: "id", ClientSecret: "s1", Organization: "org"}); err != nil {
		t.Fatal(err)
	}

	fp := func() string {
		t.Helper()
		v, err := siteFingerprint()
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	f0 := fp()
	if fp() != f0 {
		t.Fatal("fingerprint must be stable without changes")
	}

	steps := []struct {
		name string
		do   func() error
	}{
		{"same-second site edit", func() error {
			_, e := a.Engine.Exec("UPDATE site SET domain = ? WHERE name = ?", "b.example.com", "s1")
			return e
		}},
		{"cert renewal (created_time unchanged)", func() error {
			_, e := a.Engine.Exec("UPDATE cert SET certificate = ?, expire_time = ? WHERE name = ?", "CERT-2", "2028", "c1")
			return e
		}},
		{"application edit (created_time unchanged)", func() error {
			_, e := a.Engine.Exec("UPDATE application SET client_secret = ? WHERE name = ?", "s2", "app1")
			return e
		}},
	}
	prevFp := f0
	for _, st := range steps {
		if err := st.do(); err != nil {
			t.Fatalf("%s: %v", st.name, err)
		}
		cur := fp()
		if cur == prevFp {
			t.Errorf("%s: fingerprint did not change", st.name)
		}
		prevFp = cur
	}
}
