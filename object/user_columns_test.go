// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"reflect"
	"testing"

	"github.com/deluxebear/jetauth/util"
)

func TestFilterSelfServiceUserColumns(t *testing.T) {
	all := FilterSelfServiceUserColumns(nil)
	for _, forbidden := range []string{
		"email", "phone", "country_code", "password", "balance", "balance_credit", "score", "karma", "ranking",
		"is_admin", "is_forbidden", "is_deleted", "type", "groups", "email_verified", "signin_wrong_times",
		"last_signin_wrong_time", "register_type", "register_source", "application_scopes", "mfa_items", "github",
	} {
		if util.InSlice(all, forbidden) {
			t.Errorf("default self-service columns must not include %q", forbidden)
		}
	}
	if !util.InSlice(all, "display_name") || !util.InSlice(all, "webauthnCredentials") {
		t.Errorf("default self-service columns should keep profile fields and own passkeys, got %v", all)
	}

	got := FilterSelfServiceUserColumns([]string{"email", "bio", "balance", "bio", "password"})
	if !reflect.DeepEqual(got, []string{"bio"}) {
		t.Errorf("requested columns must only narrow the list, got %v", got)
	}
	if got := FilterSelfServiceUserColumns([]string{"email"}); len(got) != 0 {
		t.Errorf("a request for only forbidden columns must yield nothing, got %v", got)
	}

	// The returned slice must not alias the package-level list.
	all[0] = "email"
	if util.InSlice(FilterSelfServiceUserColumns(nil), "email") {
		t.Error("FilterSelfServiceUserColumns must return a copy")
	}
}
