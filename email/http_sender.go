// Copyright 2026 JetAuth Authors. All Rights Reserved.
package email

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// HttpEmailSender is the universal provider: endpoint + method + headers +
// body template. See email/template.go for placeholder semantics.
type HttpEmailSender struct {
	Endpoint     string
	Method       string
	ContentType  string
	HttpHeaders  map[string]string
	BodyTemplate string
	BodyMapping  map[string]string // optional: reserved for future nested mappings
	EnableProxy  bool
	Allowlist    []string // private-IP CIDRs admin allows
}

func (s *HttpEmailSender) Send(fromAddress, fromName string, toAddress []string, subject, content string) error {
	if s.Endpoint == "" {
		return fmt.Errorf("HttpEmailSender: endpoint is required")
	}
	if s.BodyTemplate == "" {
		return fmt.Errorf("HttpEmailSender: bodyTemplate is required")
	}
	method := strings.ToUpper(strings.TrimSpace(s.Method))
	if method == "" {
		method = "POST"
	}

	ctx := Context{
		FromAddress: fromAddress,
		FromName:    fromName,
		ToAddress:   firstOrEmpty(toAddress),
		ToAddresses: toAddress,
		Subject:     subject,
		Content:     content,
	}
	body, err := Render(s.BodyTemplate, s.ContentType, ctx)
	if err != nil {
		return fmt.Errorf("HttpEmailSender: render template: %w", err)
	}

	var reqBody io.Reader
	if method == "GET" || method == "HEAD" || method == "DELETE" {
		reqBody = nil
	} else {
		reqBody = strings.NewReader(body)
	}

	reqCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, method, s.Endpoint, reqBody)
	if err != nil {
		return err
	}
	if s.ContentType != "" && reqBody != nil {
		req.Header.Set("Content-Type", s.ContentType)
	}
	for k, v := range s.HttpHeaders {
		req.Header.Set(k, v)
	}

	// TEMP DEBUG: dump request for troubleshooting
	fmt.Printf("[http_sender DEBUG] %s %s\n", method, s.Endpoint)
	fmt.Printf("[http_sender DEBUG] Content-Type: %s\n", s.ContentType)
	for k, v := range s.HttpHeaders {
		if strings.EqualFold(k, "Authorization") || strings.EqualFold(k, "X-Postmark-Server-Token") || strings.EqualFold(k, "api-key") {
			fmt.Printf("[http_sender DEBUG] Header: %s: <%d chars>\n", k, len(v))
		} else {
			fmt.Printf("[http_sender DEBUG] Header: %s: %s\n", k, v)
		}
	}
	fmt.Printf("[http_sender DEBUG] Body (%d bytes): %s\n", len(body), body)
	// END TEMP DEBUG

	client := &http.Client{Transport: NewSafeTransport(s.Allowlist), Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("HttpEmailSender: request: %w", err)
	}
	defer resp.Body.Close()

	// TEMP DEBUG: dump response
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 16*1024))
	fmt.Printf("[http_sender DEBUG] Response status: %s\n", resp.Status)
	fmt.Printf("[http_sender DEBUG] Response body: %s\n", string(respBody))
	// END TEMP DEBUG

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HttpEmailSender: status %s body=%s", resp.Status, string(respBody))
	}
	return nil
}

func firstOrEmpty(ss []string) string {
	if len(ss) == 0 {
		return ""
	}
	return ss[0]
}
