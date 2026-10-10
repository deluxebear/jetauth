// Copyright 2025 The Casdoor Authors. All Rights Reserved.
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
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// syncerHttpTimeout is the per-request timeout used by the group sync helpers.
const syncerHttpTimeout = 30 * time.Second

// syncerHttpGet performs a GET request with the given headers and returns the
// response body and headers. Any non-2xx status is turned into an error that
// includes a bounded excerpt of the body.
func syncerHttpGet(url string, headers map[string]string) ([]byte, http.Header, error) {
	ctx, cancel := context.WithTimeout(context.Background(), syncerHttpTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: syncerHttpTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		excerpt := string(body)
		if len(excerpt) > 512 {
			excerpt = excerpt[:512]
		}
		return nil, nil, fmt.Errorf("GET %s failed: status=%d, body=%s", url, resp.StatusCode, excerpt)
	}

	return body, resp.Header, nil
}

// addUserToGroupMap records that memberKey belongs to groupName, skipping duplicates.
func addUserToGroupMap(m map[string][]string, memberKey string, groupName string) {
	if memberKey == "" || groupName == "" {
		return
	}
	for _, existing := range m[memberKey] {
		if existing == groupName {
			return
		}
	}
	m[memberKey] = append(m[memberKey], groupName)
}
