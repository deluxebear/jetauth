// Copyright 2026 JetAuth Authors. All Rights Reserved.
package email

// Preset is a shippable default that fills endpoint/method/headers/body so
// admins only supply credentials and account ids.
type Preset struct {
	Key             string            `json:"key"`             // stable id
	Name            string            `json:"name"`            // human-readable
	EndpointExample string            `json:"endpointExample"` // interpolatable URL hint (may contain {account_id} etc.)
	Method          string            `json:"method"`
	ContentType     string            `json:"contentType"`
	HttpHeaders     map[string]string `json:"httpHeaders"` // Authorization value is a hint — admin fills secret
	BodyTemplate    string            `json:"bodyTemplate"`
	Docs            string            `json:"docs"` // URL to upstream docs
}

var presets = []Preset{
	{
		Key:             "cloudflare",
		Name:            "Cloudflare Email Sending",
		EndpointExample: "https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Authorization": "Bearer {api_token}", "Content-Type": "application/json"},
		BodyTemplate:    `{"from":{"address":"${fromAddress}","name":"${fromName}"},"to":"${toAddress}","subject":"${subject}","html":"${content}"}`,
		Docs:            "https://developers.cloudflare.com/email-service/api/send-emails/rest-api/",
	},
	{
		Key:             "mailgun",
		Name:            "Mailgun",
		EndpointExample: "https://api.mailgun.net/v3/{domain}/messages",
		Method:          "POST",
		ContentType:     "application/x-www-form-urlencoded",
		HttpHeaders:     map[string]string{"Authorization": "Basic {base64(api:API_KEY)}"},
		BodyTemplate:    `from=${fromName} <${fromAddress}>&to=${toAddress}&subject=${subject}&html=${content}`,
		Docs:            "https://documentation.mailgun.com/en/latest/api-sending.html",
	},
	{
		Key:             "sendgrid",
		Name:            "SendGrid v3",
		EndpointExample: "https://api.sendgrid.com/v3/mail/send",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Authorization": "Bearer {api_key}", "Content-Type": "application/json"},
		BodyTemplate:    `{"personalizations":[{"to":[{"email":"${toAddress}"}],"subject":"${subject}"}],"from":{"email":"${fromAddress}","name":"${fromName}"},"content":[{"type":"text/html","value":"${content}"}]}`,
		Docs:            "https://docs.sendgrid.com/api-reference/mail-send/mail-send",
	},
	{
		Key:             "postmark",
		Name:            "Postmark",
		EndpointExample: "https://api.postmarkapp.com/email",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"X-Postmark-Server-Token": "{server_token}", "Content-Type": "application/json", "Accept": "application/json"},
		BodyTemplate:    `{"From":"${fromName} <${fromAddress}>","To":"${toAddress}","Subject":"${subject}","HtmlBody":"${content}","MessageStream":"outbound"}`,
		Docs:            "https://postmarkapp.com/developer/api/email-api",
	},
	{
		Key:             "resend",
		Name:            "Resend",
		EndpointExample: "https://api.resend.com/emails",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Authorization": "Bearer {api_key}", "Content-Type": "application/json"},
		BodyTemplate:    `{"from":"${fromName} <${fromAddress}>","to":["${toAddress}"],"subject":"${subject}","html":"${content}"}`,
		Docs:            "https://resend.com/docs/api-reference/emails/send-email",
	},
	{
		Key:             "mailjet",
		Name:            "Mailjet v3.1",
		EndpointExample: "https://api.mailjet.com/v3.1/send",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Authorization": "Basic {base64(API_KEY:SECRET)}", "Content-Type": "application/json"},
		BodyTemplate:    `{"Messages":[{"From":{"Email":"${fromAddress}","Name":"${fromName}"},"To":[{"Email":"${toAddress}"}],"Subject":"${subject}","HTMLPart":"${content}"}]}`,
		Docs:            "https://dev.mailjet.com/email/reference/send-emails/",
	},
	{
		Key:             "brevo",
		Name:            "Brevo (Sendinblue) v3",
		EndpointExample: "https://api.brevo.com/v3/smtp/email",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"api-key": "{api_key}", "Content-Type": "application/json", "Accept": "application/json"},
		BodyTemplate:    `{"sender":{"email":"${fromAddress}","name":"${fromName}"},"to":[{"email":"${toAddress}"}],"subject":"${subject}","htmlContent":"${content}"}`,
		Docs:            "https://developers.brevo.com/reference/sendtransacemail",
	},
	{
		Key:             "generic-json",
		Name:            "Generic JSON",
		EndpointExample: "https://example.com/send-email",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Content-Type": "application/json"},
		BodyTemplate:    `{"from":"${fromAddress}","fromName":"${fromName}","to":"${toAddress}","subject":"${subject}","html":"${content}"}`,
		Docs:            "",
	},
	{
		Key:             "generic-form",
		Name:            "Generic Form",
		EndpointExample: "https://example.com/send-email",
		Method:          "POST",
		ContentType:     "application/x-www-form-urlencoded",
		HttpHeaders:     map[string]string{},
		BodyTemplate:    `from=${fromAddress}&from_name=${fromName}&to=${toAddress}&subject=${subject}&html=${content}`,
		Docs:            "",
	},
}

// FindPreset returns the preset with the given key.
func FindPreset(key string) (Preset, bool) {
	for _, p := range presets {
		if p.Key == key {
			return p, true
		}
	}
	return Preset{}, false
}

// AllPresets returns a copy of the preset list.
func AllPresets() []Preset {
	cp := make([]Preset, len(presets))
	copy(cp, presets)
	return cp
}
