// Copyright 2025 JetAuth Authors
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

// This package provides ReBAC (Relation-Based Access Control) support using OpenFGA's language
// and CEL for condition evaluation. These imports ensure the dependencies are vendored.
//
// See docs/rebac-integration-plan.md for the overall architecture.

import (
	_ "github.com/google/cel-go/cel"
	_ "github.com/openfga/language/pkg/go/transformer"
)
