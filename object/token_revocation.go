// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"github.com/xorm-io/core"
)

// IsTokenRevoked reports whether a stored token row has been invalidated, either by
// RFC 7009 revocation, SSO logout or ExpireTokenByUser. All of them share one
// representation: expires_in is set to 0. Naturally expired tokens are detected
// separately from created_time + expires_in.
func IsTokenRevoked(token *Token) bool {
	return token != nil && token.ExpiresIn <= 0
}

// findTokenForRevocation looks the value up using the hint first, then falls back to
// the other token type, as RFC 7009 section 2.1 allows the server to extend its search.
func findTokenForRevocation(tokenValue, tokenTypeHint string) (*Token, error) {
	lookups := []func(string) (*Token, error){GetTokenByAccessToken, GetTokenByRefreshToken}
	switch tokenTypeHint {
	case "refresh_token", "refresh-token":
		lookups = []func(string) (*Token, error){GetTokenByRefreshToken, GetTokenByAccessToken}
	}

	for _, lookup := range lookups {
		token, err := lookup(tokenValue)
		if err != nil {
			return nil, err
		}
		if token != nil {
			return token, nil
		}
	}
	return nil, nil
}

// TokenBelongsToApplication reports whether the token was issued to the application.
func TokenBelongsToApplication(token *Token, application *Application) bool {
	return token != nil && application != nil &&
		token.Owner == application.Owner && token.Application == application.Name
}

// RevokeToken implements the server side of RFC 7009. It returns true when a token
// was actually revoked. Unknown tokens, already revoked tokens and tokens issued to a
// different client are silently ignored (no error), so that callers can always answer
// HTTP 200 as the RFC requires.
//
// Access and refresh token are stored in the same row, so revoking either one also
// invalidates its sibling, which RFC 7009 section 2.1 permits.
func RevokeToken(tokenValue, tokenTypeHint string, application *Application) (bool, error) {
	if tokenValue == "" {
		return false, nil
	}

	token, err := findTokenForRevocation(tokenValue, tokenTypeHint)
	if err != nil {
		return false, err
	}
	if !TokenBelongsToApplication(token, application) || IsTokenRevoked(token) {
		return false, nil
	}

	token.ExpiresIn = 0
	affected, err := ormer.Engine.ID(core.PK{token.Owner, token.Name}).Cols("expires_in").Update(token)
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}
