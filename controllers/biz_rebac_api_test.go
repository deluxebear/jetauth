// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package controllers

import "testing"

// TestBizBatchCheckCapConstant locks in the two CP-8 guardrails that
// keep BizBatchCheck from being a DoS amplifier: a max-items cap (so a
// single request can't schedule arbitrary serial Checks) and a wall-
// clock budget (so the loop can't outrun the request lifetime). These
// are unit-level invariants — a full httptest exercise would need
// ormer + DB bootstrap which is integration-tier.
//
// If you change either constant, also update the @Description comment
// above BizBatchCheck and the SLA note in docs/rebac-sla-baseline.md.
func TestBizBatchCheckGuardrails(t *testing.T) {
	if maxBizBatchCheckItems <= 0 {
		t.Errorf("maxBizBatchCheckItems must be positive, got %d", maxBizBatchCheckItems)
	}
	if maxBizBatchCheckItems > 1000 {
		t.Errorf("maxBizBatchCheckItems=%d is too permissive — hostile batch can pin a worker; keep ≤1000",
			maxBizBatchCheckItems)
	}
	if bizBatchCheckTimeout <= 0 {
		t.Errorf("bizBatchCheckTimeout must be positive, got %v", bizBatchCheckTimeout)
	}
}
