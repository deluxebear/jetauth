// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"testing"

	"github.com/deluxebear/jetauth/util"
)

// seedRebacAppConfigForTest creates a BizAppConfig row for the test and
// registers a t.Cleanup to tear down all derived rows (tuples, models,
// and the config itself) even if the test panics.
func seedRebacAppConfigForTest(t *testing.T, owner, appName string) {
	t.Helper()
	config := &BizAppConfig{
		Owner:       owner,
		AppName:     appName,
		DisplayName: "rebac integration test",
		Description: "seeded by biz_rebac_save_test",
		ModelType:   "rebac",
		PolicyTable: "biz_" + appName + "_policy",
		IsEnabled:   true,
		CreatedTime: util.GetCurrentTime(),
		UpdatedTime: util.GetCurrentTime(),
	}
	if _, err := AddBizAppConfig(config); err != nil {
		t.Fatalf("seed BizAppConfig: %v", err)
	}
	t.Cleanup(func() {
		_, _ = DeleteBizTuplesForApp(owner, appName)
		_, _ = DeleteBizAuthorizationModelsForApp(owner, appName)
		_, _ = DeleteBizAppConfig(config)
	})
}
