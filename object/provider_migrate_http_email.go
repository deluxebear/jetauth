// Copyright 2026 JetAuth Authors. All Rights Reserved.
package object

import "github.com/xorm-io/core"

// migrateCustomHttpEmailProviders moves legacy data written into UserMapping /
// IssuerUrl (which the old Custom HTTP Email code reused as bodyMapping /
// contentType) into the new dedicated BodyMapping / ContentType fields,
// then clears UserMapping so it stops masquerading as OAuth user mapping.
//
// Safe to run multiple times: it is a no-op once BodyMapping is populated
// or for non-Email providers.
func migrateCustomHttpEmailProviders() (int, error) {
	providers := []*Provider{}
	if err := ormer.Engine.Where("category = ? and type = ?", "Email", "Custom HTTP Email").Find(&providers); err != nil {
		return 0, err
	}
	count := 0
	for _, p := range providers {
		touched := false
		if len(p.BodyMapping) == 0 && len(p.UserMapping) > 0 {
			p.BodyMapping = p.UserMapping
			p.UserMapping = map[string]string{}
			touched = true
		}
		if p.ContentType == "" && p.IssuerUrl != "" {
			p.ContentType = p.IssuerUrl
			p.IssuerUrl = ""
			touched = true
		}
		if touched {
			if _, err := ormer.Engine.ID(core.PK{p.Owner, p.Name}).
				Cols("body_mapping", "content_type", "user_mapping", "issuer_url").
				Update(p); err != nil {
				return count, err
			}
			count++
		}
	}
	return count, nil
}
