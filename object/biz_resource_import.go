// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// BizResourceImportOptions controls path-parameter rewriting and import mode.
type BizResourceImportOptions struct {
	// PathParamMode: "colon" → {id} → :id (keyMatch2); "star" → * ;
	// "keep" → leave {id} as-is. Default "colon".
	PathParamMode string `json:"pathParamMode"`
	// DefaultMatchMode applied when the source does not carry one. Default
	// "keyMatch2".
	DefaultMatchMode string `json:"defaultMatchMode"`
	// DefaultGroup used when the entry has no group. Default "".
	DefaultGroup string `json:"defaultGroup"`
	// FullReplace: when true and Format=="openapi", entries in the existing
	// catalog but absent from the OpenAPI spec are marked Deprecated.
	FullReplace bool `json:"fullReplace"`
}

// BizResourceImportRequest is the body shape for biz-parse-resource-import.
type BizResourceImportRequest struct {
	Owner   string                   `json:"owner"`
	AppName string                   `json:"appName"`
	Format  string                   `json:"format"` // openapi | csv | yaml | json | paste
	Content string                   `json:"content"`
	Options BizResourceImportOptions `json:"options"`
}

// BizResourceImportRow is one parsed row with its classification.
type BizResourceImportRow struct {
	Kind     string         `json:"kind"` // new | update | deprecated | error
	LineNo   int            `json:"lineNo,omitempty"`
	Error    string         `json:"error,omitempty"`
	Proposed BizAppResource `json:"proposed"`
	// For kind="update", Existing carries the current row so UI can show diff.
	Existing *BizAppResource `json:"existing,omitempty"`
}

// BizResourceImportPreview is the response body of biz-parse-resource-import
// and also the input body of biz-import-app-resources.
type BizResourceImportPreview struct {
	Owner   string                   `json:"owner"`
	AppName string                   `json:"appName"`
	Format  string                   `json:"format"`
	Options BizResourceImportOptions `json:"options"`
	Rows    []BizResourceImportRow   `json:"rows"`
	// Aggregates to show "新增 23 / 更新 5 / 废弃 2 / 错误 3".
	NewCount        int `json:"newCount"`
	UpdateCount     int `json:"updateCount"`
	DeprecatedCount int `json:"deprecatedCount"`
	ErrorCount      int `json:"errorCount"`
}

// ParseBizResourceImport parses the given content into a preview. No writes
// happen here; callers pass the selected rows back to ImportBizAppResources.
func ParseBizResourceImport(req *BizResourceImportRequest) (*BizResourceImportPreview, error) {
	if req.Owner == "" || req.AppName == "" {
		return nil, fmt.Errorf("owner and appName are required")
	}
	opts := req.Options
	if opts.PathParamMode == "" {
		opts.PathParamMode = "colon"
	}
	if opts.DefaultMatchMode == "" {
		opts.DefaultMatchMode = "keyMatch2"
	}

	preview := &BizResourceImportPreview{
		Owner:   req.Owner,
		AppName: req.AppName,
		Format:  req.Format,
		Options: opts,
	}

	existing, err := ListBizAppResources(req.Owner, req.AppName)
	if err != nil {
		return nil, err
	}
	existingByName := make(map[string]*BizAppResource, len(existing))
	for _, r := range existing {
		existingByName[r.Name] = r
	}

	var parsed []BizAppResource
	switch strings.ToLower(req.Format) {
	case "openapi":
		parsed, err = parseOpenAPI(req.Content, &opts)
	case "csv":
		parsed, err = parseCSV(req.Content, &opts)
	case "yaml":
		parsed, err = parseYAMLTemplate(req.Content, &opts)
	case "json":
		parsed, err = parseJSONTemplate(req.Content, &opts)
	case "paste":
		parsed, err = parsePaste(req.Content, &opts)
	default:
		return nil, fmt.Errorf("unsupported format %q", req.Format)
	}
	if err != nil {
		return nil, err
	}

	for i := range parsed {
		p := parsed[i]
		p.Owner = req.Owner
		p.AppName = req.AppName
		if p.MatchMode == "" {
			p.MatchMode = opts.DefaultMatchMode
		}
		if p.Group == "" {
			p.Group = opts.DefaultGroup
		}
		if p.Source == "" {
			switch strings.ToLower(req.Format) {
			case "openapi":
				p.Source = BizResourceSourceOpenAPI
			case "paste":
				p.Source = BizResourceSourcePaste
			default:
				p.Source = BizResourceSourceTpl
			}
		}
		lineNo := extractLineNoFromSourceRef(p.SourceRef)
		// Validate + classify
		if err := validateBizAppResource(&p); err != nil {
			preview.Rows = append(preview.Rows, BizResourceImportRow{
				Kind: "error", LineNo: lineNo, Error: err.Error(), Proposed: p,
			})
			preview.ErrorCount++
			continue
		}

		if prev, ok := existingByName[p.Name]; ok {
			if resourceDiffers(prev, &p) {
				preview.Rows = append(preview.Rows, BizResourceImportRow{
					Kind: "update", LineNo: lineNo, Proposed: p, Existing: prev,
				})
				preview.UpdateCount++
			}
			// Mark as seen so it is NOT flagged as deprecated below.
			delete(existingByName, p.Name)
			continue
		}
		preview.Rows = append(preview.Rows, BizResourceImportRow{
			Kind: "new", LineNo: lineNo, Proposed: p,
		})
		preview.NewCount++
	}

	// Deprecated detection only when user opts in and format is a full-spec
	// source (OpenAPI). Partial imports must not auto-deprecate.
	if opts.FullReplace && strings.EqualFold(req.Format, "openapi") {
		for _, prev := range existingByName {
			if prev.Deprecated {
				continue
			}
			proposed := *prev
			proposed.Deprecated = true
			preview.Rows = append(preview.Rows, BizResourceImportRow{
				Kind: "deprecated", Proposed: proposed, Existing: prev,
			})
			preview.DeprecatedCount++
		}
	}

	return preview, nil
}

// extractLineNoFromSourceRef parses "paste:line:42" or "csv:row:7" etc.
// Returns 0 when no trailing integer is found — callers treat 0 as "no line".
func extractLineNoFromSourceRef(ref string) int {
	if ref == "" {
		return 0
	}
	idx := strings.LastIndex(ref, ":")
	if idx == -1 || idx == len(ref)-1 {
		return 0
	}
	n := 0
	for _, ch := range ref[idx+1:] {
		if ch < '0' || ch > '9' {
			return 0
		}
		n = n*10 + int(ch-'0')
	}
	return n
}

func resourceDiffers(a, b *BizAppResource) bool {
	return a.Group != b.Group ||
		a.DisplayName != b.DisplayName ||
		a.Description != b.Description ||
		a.Pattern != b.Pattern ||
		a.Methods != b.Methods ||
		a.MatchMode != b.MatchMode ||
		a.Deprecated != b.Deprecated
}

// ── Path parameter rewriting ──────────────────────────────────────────

var openapiParamRe = regexp.MustCompile(`\{([^/}]+)\}`)

func rewritePath(p, mode string) string {
	switch mode {
	case "star":
		return openapiParamRe.ReplaceAllString(p, "*")
	case "keep":
		return p
	default: // "colon"
		return openapiParamRe.ReplaceAllString(p, ":$1")
	}
}

// sanitizeName derives a stable BizAppResource.Name from a method + path.
// The resulting string is lowercase alphanum + "_", without leading digits.
func sanitizeName(method, pattern string) string {
	s := strings.ToLower(method + "_" + pattern)
	b := strings.Builder{}
	for _, ch := range s {
		switch {
		case ch >= 'a' && ch <= 'z', ch >= '0' && ch <= '9':
			b.WriteRune(ch)
		default:
			b.WriteRune('_')
		}
	}
	out := strings.Trim(b.String(), "_")
	// Collapse repeated underscores.
	out = regexp.MustCompile(`_+`).ReplaceAllString(out, "_")
	if out == "" {
		out = "resource"
	}
	return out
}

// ── OpenAPI parser (minimal) ─────────────────────────────────────────

// Enough of the OpenAPI 3.x shape to walk paths × methods × tags. JSON and
// YAML both deserialize into this via the yaml.v3 package (YAML is JSON's
// superset).
type oasDoc struct {
	Paths map[string]map[string]oasOp `yaml:"paths" json:"paths"`
}

type oasOp struct {
	OperationId string   `yaml:"operationId" json:"operationId"`
	Summary     string   `yaml:"summary" json:"summary"`
	Description string   `yaml:"description" json:"description"`
	Tags        []string `yaml:"tags" json:"tags"`
}

var oasHTTPMethods = map[string]bool{
	"get": true, "post": true, "put": true, "delete": true,
	"patch": true, "head": true, "options": true, "trace": true,
}

func parseOpenAPI(content string, opts *BizResourceImportOptions) ([]BizAppResource, error) {
	var doc oasDoc
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return nil, fmt.Errorf("openapi content is empty")
	}
	// Try JSON first (faster); fall back to YAML (which is a superset).
	if strings.HasPrefix(trimmed, "{") {
		if err := json.Unmarshal([]byte(content), &doc); err != nil {
			return nil, fmt.Errorf("openapi JSON parse: %w", err)
		}
	} else {
		if err := yaml.Unmarshal([]byte(content), &doc); err != nil {
			return nil, fmt.Errorf("openapi YAML parse: %w", err)
		}
	}
	if len(doc.Paths) == 0 {
		return nil, fmt.Errorf("no paths found in openapi document")
	}

	out := make([]BizAppResource, 0, len(doc.Paths)*3)
	for rawPath, methods := range doc.Paths {
		pattern := rewritePath(rawPath, opts.PathParamMode)
		for m, op := range methods {
			if !oasHTTPMethods[strings.ToLower(m)] {
				continue
			}
			method := strings.ToUpper(m)
			group := ""
			if len(op.Tags) > 0 {
				group = op.Tags[0]
			} else {
				group = deriveGroupFromPath(rawPath)
			}
			display := op.Summary
			if display == "" {
				display = fmt.Sprintf("%s %s", method, pattern)
			}
			name := op.OperationId
			if name == "" {
				name = sanitizeName(method, pattern)
			}
			out = append(out, BizAppResource{
				Name:        name,
				Group:       group,
				DisplayName: display,
				Description: op.Description,
				Pattern:     pattern,
				Methods:     method,
				SourceRef:   op.OperationId,
			})
		}
	}
	return out, nil
}

// deriveGroupFromPath returns the first non-empty path segment as a fallback
// group label: "/api/orders/:id" → "orders".
func deriveGroupFromPath(p string) string {
	parts := strings.Split(p, "/")
	for _, seg := range parts {
		seg = strings.TrimSpace(seg)
		if seg == "" || seg == "api" || strings.HasPrefix(seg, "{") || strings.HasPrefix(seg, ":") {
			continue
		}
		return seg
	}
	return ""
}

// ── CSV parser ───────────────────────────────────────────────────────

// csvHeaders is the canonical column order. CSV files may include any subset
// in any order as long as required columns (name, method, pattern,
// displayName) are present.
var csvHeaders = []string{"group", "name", "displayName", "method", "pattern", "matchMode", "description"}

func parseCSV(content string, _ *BizResourceImportOptions) ([]BizAppResource, error) {
	r := csv.NewReader(strings.NewReader(content))
	r.TrimLeadingSpace = true
	r.FieldsPerRecord = -1 // tolerate ragged rows
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("csv parse: %w", err)
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("csv is empty")
	}
	header := rows[0]
	colIdx := map[string]int{}
	for i, h := range header {
		colIdx[strings.ToLower(strings.TrimSpace(h))] = i
	}
	for _, required := range []string{"name", "method", "pattern", "displayname"} {
		if _, ok := colIdx[required]; !ok {
			return nil, fmt.Errorf("csv missing required column %q (expected: %s)", required, strings.Join(csvHeaders, ", "))
		}
	}

	get := func(row []string, col string) string {
		idx, ok := colIdx[col]
		if !ok || idx >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[idx])
	}

	out := make([]BizAppResource, 0, len(rows)-1)
	for i, row := range rows[1:] {
		if isBlank(row) {
			continue
		}
		out = append(out, BizAppResource{
			Group:       get(row, "group"),
			Name:        get(row, "name"),
			DisplayName: get(row, "displayname"),
			Methods:     normalizeMethods(get(row, "method")),
			Pattern:     get(row, "pattern"),
			MatchMode:   get(row, "matchmode"),
			Description: get(row, "description"),
			SourceRef:   fmt.Sprintf("csv:row:%d", i+2),
		})
	}
	return out, nil
}

func isBlank(row []string) bool {
	for _, s := range row {
		if strings.TrimSpace(s) != "" {
			return false
		}
	}
	return true
}

// ── JSON / YAML template parser ──────────────────────────────────────

type resourceTemplateFile struct {
	Version   int                   `yaml:"version" json:"version"`
	Resources []resourceTemplateRow `yaml:"resources" json:"resources"`
}

// resourceTemplateRow accepts method as either a comma-string or a list.
type resourceTemplateRow struct {
	Group       string      `yaml:"group" json:"group"`
	Name        string      `yaml:"name" json:"name"`
	DisplayName string      `yaml:"displayName" json:"displayName"`
	Description string      `yaml:"description" json:"description"`
	Method      interface{} `yaml:"method" json:"method"`
	Pattern     string      `yaml:"pattern" json:"pattern"`
	MatchMode   string      `yaml:"matchMode" json:"matchMode"`
}

func parseYAMLTemplate(content string, _ *BizResourceImportOptions) ([]BizAppResource, error) {
	var f resourceTemplateFile
	if err := yaml.Unmarshal([]byte(content), &f); err != nil {
		return nil, fmt.Errorf("yaml template parse: %w", err)
	}
	return templateRowsToResources(f.Resources), nil
}

func parseJSONTemplate(content string, _ *BizResourceImportOptions) ([]BizAppResource, error) {
	var f resourceTemplateFile
	dec := json.NewDecoder(bytes.NewReader([]byte(content)))
	dec.UseNumber()
	if err := dec.Decode(&f); err != nil && err != io.EOF {
		return nil, fmt.Errorf("json template parse: %w", err)
	}
	return templateRowsToResources(f.Resources), nil
}

func templateRowsToResources(rows []resourceTemplateRow) []BizAppResource {
	out := make([]BizAppResource, 0, len(rows))
	for i, r := range rows {
		out = append(out, BizAppResource{
			Group:       r.Group,
			Name:        r.Name,
			DisplayName: r.DisplayName,
			Description: r.Description,
			Methods:     coerceMethodField(r.Method),
			Pattern:     r.Pattern,
			MatchMode:   r.MatchMode,
			SourceRef:   fmt.Sprintf("template:row:%d", i+1),
		})
	}
	return out
}

func coerceMethodField(v interface{}) string {
	switch t := v.(type) {
	case string:
		return normalizeMethods(t)
	case []interface{}:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			if s, ok := item.(string); ok {
				parts = append(parts, s)
			}
		}
		return normalizeMethods(strings.Join(parts, ","))
	case nil:
		return ""
	default:
		return ""
	}
}

// ── Paste parser ─────────────────────────────────────────────────────
//
// Heuristic: split into lines, try three shapes per line —
//   (1) cURL command: extract -X METHOD and URL
//   (2) "METHOD /path [displayName]" where METHOD is a standard HTTP verb
//   (3) "group/displayName  METHOD  /path" (tab or multi-space separated)

var (
	curlMethodRe = regexp.MustCompile(`(?i)-X\s+([A-Z]+)`)
	curlURLRe    = regexp.MustCompile(`https?://[^\s"']+`)
	httpMethodRe = regexp.MustCompile(`(?i)^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\b`)
)

func parsePaste(content string, opts *BizResourceImportOptions) ([]BizAppResource, error) {
	lines := strings.Split(content, "\n")
	out := make([]BizAppResource, 0, len(lines))
	for i, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
			continue
		}
		row, ok := tryParsePasteLine(line, opts)
		if !ok {
			// Preserve the error as a row so UI can surface the line number.
			out = append(out, BizAppResource{
				SourceRef: fmt.Sprintf("paste:line:%d", i+1),
				// Empty Pattern triggers validateBizAppResource error → kind=error.
			})
			continue
		}
		row.SourceRef = fmt.Sprintf("paste:line:%d", i+1)
		out = append(out, row)
	}
	return out, nil
}

func tryParsePasteLine(line string, opts *BizResourceImportOptions) (BizAppResource, bool) {
	// Shape 1: cURL
	if strings.HasPrefix(strings.ToLower(line), "curl") {
		method := "GET"
		if m := curlMethodRe.FindStringSubmatch(line); len(m) == 2 {
			method = strings.ToUpper(m[1])
		}
		if u := curlURLRe.FindString(line); u != "" {
			// Drop scheme ("http://" or "https://") then everything up to the
			// first "/" is the host — keep what follows.
			after := u
			if i := strings.Index(u, "://"); i != -1 {
				after = u[i+3:]
			}
			path := "/"
			if slash := strings.Index(after, "/"); slash != -1 {
				path = after[slash:]
			}
			pattern := rewritePath(path, opts.PathParamMode)
			return BizAppResource{
				Name:        sanitizeName(method, pattern),
				DisplayName: fmt.Sprintf("%s %s", method, pattern),
				Methods:     method,
				Pattern:     pattern,
				Group:       deriveGroupFromPath(path),
			}, true
		}
		return BizAppResource{}, false
	}

	// Shape 2: "METHOD /path  displayName…"
	if m := httpMethodRe.FindStringSubmatch(line); len(m) == 2 {
		method := strings.ToUpper(m[1])
		rest := strings.TrimSpace(line[len(m[0]):])
		fields := strings.Fields(rest)
		if len(fields) == 0 {
			return BizAppResource{}, false
		}
		path := fields[0]
		if !strings.HasPrefix(path, "/") {
			return BizAppResource{}, false
		}
		display := strings.TrimSpace(strings.Join(fields[1:], " "))
		if display == "" {
			display = fmt.Sprintf("%s %s", method, path)
		}
		pattern := rewritePath(path, opts.PathParamMode)
		return BizAppResource{
			Name:        sanitizeName(method, pattern),
			DisplayName: display,
			Methods:     method,
			Pattern:     pattern,
			Group:       deriveGroupFromPath(path),
		}, true
	}

	// Shape 3: "group/displayName \t METHOD \t /path"
	fields := splitByTabOrMultiSpace(line)
	if len(fields) >= 3 {
		label := fields[0]
		method := strings.ToUpper(fields[1])
		path := fields[2]
		if !oasHTTPMethods[strings.ToLower(method)] || !strings.HasPrefix(path, "/") {
			return BizAppResource{}, false
		}
		group, display := label, label
		if idx := strings.Index(label, "/"); idx != -1 {
			group = strings.TrimSpace(label[:idx])
			display = strings.TrimSpace(label[idx+1:])
		}
		pattern := rewritePath(path, opts.PathParamMode)
		return BizAppResource{
			Name:        sanitizeName(method, pattern),
			Group:       group,
			DisplayName: display,
			Methods:     method,
			Pattern:     pattern,
		}, true
	}

	return BizAppResource{}, false
}

func splitByTabOrMultiSpace(s string) []string {
	// Split by tab first; if there's no tab, split by runs of 2+ spaces.
	if strings.Contains(s, "\t") {
		parts := strings.Split(s, "\t")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			if t := strings.TrimSpace(p); t != "" {
				out = append(out, t)
			}
		}
		return out
	}
	parts := regexp.MustCompile(`\s{2,}`).Split(s, -1)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
