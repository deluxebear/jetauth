// Copyright 2023 The Casdoor Authors. All Rights Reserved.
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

package email

type EmailProvider interface {
	Send(fromAddress string, fromName string, toAddress []string, subject string, content string) error
}

// HttpEmailOptions collects every custom-http-email-specific config so the
// top-level GetEmailProvider signature stays maintainable.
type HttpEmailOptions struct {
	Endpoint     string
	Method       string
	ContentType  string
	HttpHeaders  map[string]string
	BodyMapping  map[string]string
	BodyTemplate string
	EnableProxy  bool
	Allowlist    []string
}

type EmailOptions struct {
	ClientId     string
	ClientSecret string
	Host         string
	Port         int
	SslMode      string
	EnableProxy  bool
	// Used only by SendGrid to set the REST endpoint override.
	Endpoint string
	// Populated only when Type == "Custom HTTP Email".
	Http *HttpEmailOptions
}

func GetEmailProvider(typ string, o EmailOptions) EmailProvider {
	switch typ {
	case "Azure ACS":
		return NewAzureACSEmailProvider(o.ClientSecret, o.Host)
	case "Custom HTTP Email":
		if o.Http == nil {
			return nil
		}
		return &HttpEmailSender{
			Endpoint:     o.Http.Endpoint,
			Method:       o.Http.Method,
			ContentType:  o.Http.ContentType,
			HttpHeaders:  o.Http.HttpHeaders,
			BodyMapping:  o.Http.BodyMapping,
			BodyTemplate: o.Http.BodyTemplate,
			EnableProxy:  o.Http.EnableProxy,
			Allowlist:    o.Http.Allowlist,
		}
	case "SendGrid":
		return NewSendgridEmailProvider(o.ClientSecret, o.Host, o.Endpoint)
	case "Resend":
		return NewResendEmailProvider(o.ClientSecret)
	default:
		return NewSmtpEmailProvider(o.ClientId, o.ClientSecret, o.Host, o.Port, typ, o.SslMode, o.EnableProxy)
	}
}
