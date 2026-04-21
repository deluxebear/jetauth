// Copyright 2024 The JetAuth Authors. All Rights Reserved.
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

package embedded

import "io/fs"

// WebFS holds the embedded frontend filesystem (web/build).
// It is nil when built without the "embed" build tag.
var WebFS fs.FS

// SwaggerFS holds the embedded swagger filesystem.
// It is nil when built without the "embed" build tag.
var SwaggerFS fs.FS

// WebBuildDir is the on-disk location the embedded web/build tree was
// extracted to at startup. Empty when built without the "embed" tag.
// Callers that read static assets from disk (routers/static_filter.go,
// beego's SetStaticPath) can use this path as a fallback when the working
// directory has no ./web/build/.
var WebBuildDir string

// SwaggerDir is the on-disk location the embedded swagger tree was
// extracted to at startup. Empty when built without the "embed" tag.
var SwaggerDir string
