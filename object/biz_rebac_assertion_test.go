package object

import (
	"testing"

	"github.com/deluxebear/jetauth/util"
)

func TestBizReBACAssertion_RoundTrip(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "drive_assertion"
	seedRebacAppConfigForTest(t, owner, appName)

	a := &BizReBACAssertion{
		Owner: owner, AppName: appName,
		Object: "document:roadmap-2026", Relation: "viewer", User: "user:carol",
		Expected: true,
	}
	if _, err := AddBizReBACAssertion(a); err != nil {
		t.Fatalf("AddBizReBACAssertion: %v", err)
	}
	got, err := ListBizReBACAssertions(owner, appName)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].User != "user:carol" {
		t.Fatalf("got %+v", got)
	}
}
