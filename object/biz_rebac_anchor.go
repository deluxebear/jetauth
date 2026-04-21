// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

// biz_rebac_anchor.go holds blank imports for ReBAC deps that are vendored
// ahead of first use. `go mod vendor` only keeps packages that are
// reachable by import; without this file, `go mod tidy` would reclassify
// openfga/language and cel-go as unused and strip them from vendor/ on the
// next vendor run.
//
// Lifecycle:
//   - openfga/language/pkg/go/transformer — first real import arrives in
//     object/biz_rebac_schema.go (Task 7 of PR1). Remove its anchor then.
//   - google/cel-go/cel — first real import arrives in
//     object/biz_rebac_condition.go (CP-4 in PR2). Remove its anchor then.
//
// When both anchors are gone, delete this file.

import (
	_ "github.com/google/cel-go/cel"
	_ "github.com/openfga/language/pkg/go/transformer"
)
