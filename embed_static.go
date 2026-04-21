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

//go:build embed

package main

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/deluxebear/jetauth/embedded"
)

//go:embed all:web/build
var embeddedWebFS embed.FS

//go:embed all:swagger
var embeddedSwaggerFS embed.FS

func init() {
	if sub, err := fs.Sub(embeddedWebFS, "web/build"); err == nil {
		embedded.WebFS = sub
	}
	if sub, err := fs.Sub(embeddedSwaggerFS, "swagger"); err == nil {
		embedded.SwaggerFS = sub
	}

	// Extract the embedded trees to a temp dir so the disk-reading code
	// paths (routers/static_filter.go, beego's SetStaticPath) work without
	// a neighbouring web/build/. The extraction happens once per process
	// and is cheap on every platform we ship.
	base, err := os.MkdirTemp("", "jetauth-embedded-*")
	if err != nil {
		panic(fmt.Sprintf("jetauth embed: create temp dir: %v", err))
	}

	webDir := filepath.Join(base, "web", "build")
	if err := extractEmbed(embeddedWebFS, "web/build", webDir); err != nil {
		panic(fmt.Sprintf("jetauth embed: extract web/build: %v", err))
	}
	embedded.WebBuildDir = webDir

	swDir := filepath.Join(base, "swagger")
	if err := extractEmbed(embeddedSwaggerFS, "swagger", swDir); err != nil {
		panic(fmt.Sprintf("jetauth embed: extract swagger: %v", err))
	}
	embedded.SwaggerDir = swDir
}

func extractEmbed(src embed.FS, srcRoot, destRoot string) error {
	if err := os.MkdirAll(destRoot, 0o755); err != nil {
		return err
	}
	return fs.WalkDir(src, srcRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(srcRoot, p)
		if err != nil {
			return err
		}
		target := filepath.Join(destRoot, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := src.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
}
