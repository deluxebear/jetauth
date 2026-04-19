// Copyright 2026 The JetAuth Authors. All rights reserved.
//
// Application-level data migrations that run once per backend startup
// after xorm Sync2 has created / updated the columns.

package object

import (
	"log"
)

// migrateLegacyFormBackground moves existing FormBackgroundUrl values onto
// the new "full-bleed" layout template for any application that has not
// picked a template yet. Lets long-running apps keep their visual intent
// (full-bleed background image) when the admin hasn't explicitly opted
// into the template system.
//
// Idempotent: only fires when Template == "" AND FormBackgroundUrl != "".
// Safe to re-run — touched apps no longer match the predicate because
// Template becomes "full-bleed".
func migrateLegacyFormBackground() {
	apps := []*Application{}
	if err := ormer.Engine.Find(&apps); err != nil {
		log.Printf("[template-migrate] scan failed: %v", err)
		return
	}

	migrated := 0
	for _, app := range apps {
		if app.Template != "" || app.FormBackgroundUrl == "" {
			continue
		}
		opts := map[string]any{
			"backgroundImageUrl": app.FormBackgroundUrl,
		}
		if app.FormBackgroundUrlMobile != "" {
			// No dark variant in the legacy schema — mobile bg is closest
			// analogue. Admins can adjust in the UI afterwards.
			opts["backgroundImageUrlDark"] = app.FormBackgroundUrlMobile
		}
		app.Template = "full-bleed"
		app.TemplateOptions = opts
		if _, err := ormer.Engine.ID(
			map[string]any{"owner": app.Owner, "name": app.Name},
		).Cols("template", "template_options").Update(app); err != nil {
			log.Printf("[template-migrate] %s/%s update failed: %v", app.Owner, app.Name, err)
			continue
		}
		migrated++
	}

	if migrated > 0 {
		log.Printf("[template-migrate] moved %d application(s) with formBackgroundUrl onto the full-bleed template", migrated)
	}
}
