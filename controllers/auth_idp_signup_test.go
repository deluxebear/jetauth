// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package controllers

import (
	"testing"

	"github.com/deluxebear/jetauth/object"
)

func TestCheckIdpAutoSignup(t *testing.T) {
	cases := []struct {
		name string
		app  *object.Application
		item *object.ProviderItem
		want idpSignupDenial
	}{
		{"both allow", &object.Application{EnableSignUp: true}, &object.ProviderItem{CanSignUp: true}, idpSignupAllowed},
		{"application signup disabled", &object.Application{EnableSignUp: false}, &object.ProviderItem{CanSignUp: true}, idpSignupDeniedByApplication},
		{"provider signup disabled", &object.Application{EnableSignUp: true}, &object.ProviderItem{CanSignUp: false}, idpSignupDeniedByProvider},
		{"nil provider item", &object.Application{EnableSignUp: true}, nil, idpSignupDeniedByProvider},
		{"nil application", nil, &object.ProviderItem{CanSignUp: true}, idpSignupDeniedByApplication},
		{"both disabled reports application first", &object.Application{}, &object.ProviderItem{}, idpSignupDeniedByApplication},
	}
	for _, c := range cases {
		if got := checkIdpAutoSignup(c.app, c.item); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
