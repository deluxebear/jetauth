// Copyright 2021 The Casdoor Authors. All Rights Reserved.
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

// modified from https://github.com/casbin/casnode/blob/master/service/mail.go

package object

import (
	"fmt"
	"strings"

	"github.com/deluxebear/jetauth/conf"
	"github.com/deluxebear/jetauth/email"
)

// TestSmtpServer Test the SMTP server
func TestSmtpServer(provider *Provider) error {
	sslMode := getSslMode(provider)
	smtpEmailProvider := email.NewSmtpEmailProvider(provider.ClientId, provider.ClientSecret, provider.Host, provider.Port, provider.Type, sslMode, provider.EnableProxy)
	sender, err := smtpEmailProvider.Dialer.Dial()
	if err != nil {
		return err
	}
	defer sender.Close()

	return nil
}

func SendEmail(provider *Provider, title string, content string, dest []string, sender string) error {
	sslMode := getSslMode(provider)

	opts := email.EmailOptions{
		ClientId:     provider.ClientId,
		ClientSecret: provider.ClientSecret,
		Host:         provider.Host,
		Port:         provider.Port,
		SslMode:      sslMode,
		EnableProxy:  provider.EnableProxy,
		Endpoint:     provider.Endpoint,
	}

	if provider.Type == "Custom HTTP Email" {
		opts.Http = &email.HttpEmailOptions{
			Endpoint:     provider.Endpoint,
			Method:       provider.Method,
			ContentType:  provider.ContentType,
			HttpHeaders:  provider.HttpHeaders,
			BodyMapping:  provider.BodyMapping,
			BodyTemplate: provider.BodyTemplate,
			EnableProxy:  provider.EnableProxy,
			Allowlist:    getSsrfAllowlist(),
		}
	}

	emailProvider := email.GetEmailProvider(provider.Type, opts)
	if emailProvider == nil {
		return fmt.Errorf("SendEmail: provider %q is not configured", provider.Name)
	}

	fromAddress := provider.ClientId2
	if fromAddress == "" {
		fromAddress = provider.ClientId
	}
	fromName := provider.ClientSecret2
	if fromName == "" {
		fromName = sender
	}
	return emailProvider.Send(fromAddress, fromName, dest, title, content)
}

// getSsrfAllowlist reads comma-separated CIDRs from `ssrfAllowedHosts` conf key.
func getSsrfAllowlist() []string {
	raw := conf.GetConfigString("ssrfAllowedHosts")
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// getSslMode returns the SSL mode for the provider, with backward compatibility for DisableSsl
func getSslMode(provider *Provider) string {
	// If SslMode is set, use it
	if provider.SslMode != "" {
		return provider.SslMode
	}

	// Backward compatibility: convert DisableSsl to SslMode
	if provider.DisableSsl {
		return "Disable"
	}

	// Default to "Auto" for new configurations or when DisableSsl is false
	return "Auto"
}
