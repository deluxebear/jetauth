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

package conf

import (
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

//go:embed app.conf
var defaultAppConf string

// EnsureConfigFile creates the config file at path when it does not exist,
// seeding it from the embedded default with per-deployment random values
// substituted for fields that must not be shared across installations.
// Returns true if a new file was written.
func EnsureConfigFile(path string) (bool, error) {
	if _, err := os.Stat(path); err == nil {
		return false, nil
	} else if !os.IsNotExist(err) {
		return false, err
	}

	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return false, fmt.Errorf("create config dir %s: %w", dir, err)
		}
	}

	content, err := renderDefaultConfig()
	if err != nil {
		return false, err
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return false, fmt.Errorf("write default config to %s: %w", path, err)
	}
	return true, nil
}

var authStateLine = regexp.MustCompile(`(?m)^authState\s*=.*$`)

func renderDefaultConfig() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate random authState: %w", err)
	}
	token := hex.EncodeToString(buf)

	// authState is the prefix for OAuth state cookies; giving each
	// deployment a random suffix keeps two JetAuth instances on the
	// same domain from colliding on in-flight OAuth handshakes.
	return authStateLine.ReplaceAllString(
		defaultAppConf,
		fmt.Sprintf(`authState = "jetauth-%s"`, token),
	), nil
}
