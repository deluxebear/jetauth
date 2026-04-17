// Copyright 2026 JetAuth Authors. All Rights Reserved.
package email

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// Context holds every variable a template may reference.
// Consumers fill it before calling Render.
type Context struct {
	FromAddress string
	FromName    string
	ToAddress   string   // first recipient (string placeholder)
	ToAddresses []string // all recipients (array placeholder)
	Subject     string
	Content     string  // HTML body
	ContentText string  // plain text body (optional)
}

var placeholderRe = regexp.MustCompile(`\$\{([a-zA-Z][a-zA-Z0-9_]*)\}`)

// Render substitutes ${var} placeholders in tmpl using ctx, escaping each
// value appropriately for contentType. ${toAddresses} is a structural
// placeholder that expands to a native array/multi-value — not a string.
func Render(tmpl, contentType string, ctx Context) (string, error) {
	var firstErr error
	out := placeholderRe.ReplaceAllStringFunc(tmpl, func(m string) string {
		name := placeholderRe.FindStringSubmatch(m)[1]
		v, err := lookup(name, ctx, contentType)
		if err != nil && firstErr == nil {
			firstErr = err
		}
		return v
	})
	if firstErr != nil {
		return "", firstErr
	}
	return out, nil
}

func lookup(name string, ctx Context, contentType string) (string, error) {
	switch name {
	case "fromAddress":
		return escape(ctx.FromAddress, contentType), nil
	case "fromName":
		return escape(ctx.FromName, contentType), nil
	case "toAddress":
		return escape(ctx.ToAddress, contentType), nil
	case "toAddresses":
		return encodeArray(ctx.ToAddresses, contentType), nil
	case "subject":
		return escape(ctx.Subject, contentType), nil
	case "content":
		return escape(ctx.Content, contentType), nil
	case "contentText":
		return escape(ctx.ContentText, contentType), nil
	default:
		return "", fmt.Errorf("unknown placeholder ${%s}", name)
	}
}

func escape(v, contentType string) string {
	switch normalizeContentType(contentType) {
	case "application/json":
		b, _ := json.Marshal(v) // always succeeds for string
		s := string(b)
		return s[1 : len(s)-1] // strip surrounding quotes (template supplies them)
	case "application/x-www-form-urlencoded":
		return url.QueryEscape(v)
	case "text/plain", "":
		return v
	default:
		return v
	}
}

func encodeArray(vs []string, contentType string) string {
	switch normalizeContentType(contentType) {
	case "application/json":
		b, _ := json.Marshal(vs)
		return string(b)
	case "application/x-www-form-urlencoded":
		parts := make([]string, 0, len(vs))
		for _, v := range vs {
			parts = append(parts, url.QueryEscape(v))
		}
		return strings.Join(parts, ",")
	default:
		return strings.Join(vs, ",")
	}
}

func normalizeContentType(ct string) string {
	// strip parameters like "; charset=utf-8"
	if i := strings.Index(ct, ";"); i >= 0 {
		ct = ct[:i]
	}
	return strings.ToLower(strings.TrimSpace(ct))
}
