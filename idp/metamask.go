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

package idp

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	siwe "github.com/spruceid/siwe-go"
	"golang.org/x/oauth2"
)

// siweCodePayload is the frontend-assembled envelope the MetaMask /
// Web3Onboard flow POSTs as `code` to /api/login. We carry both the raw
// EIP-4361 message (what the user actually signed) AND the signature so
// the backend can re-parse and re-verify every field — address, nonce,
// domain, timestamps — instead of trusting client-sent scalars.
type siweCodePayload struct {
	Message   string `json:"message"`
	Signature string `json:"signature"`
}

type MetaMaskIdProvider struct {
	Client         *http.Client
	ExpectedNonce  string
	ExpectedDomain string
}

// NewMetaMaskIdProvider takes the SIWE verification context (server-issued
// nonce and expected domain) from the controller. Both are required; an
// empty nonce would let anyone replay an old signature forever, and an
// empty domain would accept signatures issued for other sites.
func NewMetaMaskIdProvider(expectedNonce string, expectedDomain string) *MetaMaskIdProvider {
	return &MetaMaskIdProvider{
		ExpectedNonce:  expectedNonce,
		ExpectedDomain: expectedDomain,
	}
}

func (idp *MetaMaskIdProvider) SetHttpClient(client *http.Client) {
	idp.Client = client
}

func (idp *MetaMaskIdProvider) GetToken(code string) (*oauth2.Token, error) {
	return verifyWeb3SIWE(code, idp.ExpectedNonce, idp.ExpectedDomain, "MetaMask")
}

func (idp *MetaMaskIdProvider) GetUserInfo(token *oauth2.Token) (*UserInfo, error) {
	web3AuthToken, ok := token.Extra(Web3AuthTokenKey).(Web3AuthToken)
	if !ok {
		return nil, errors.New("invalid web3AuthToken")
	}
	userInfo := &UserInfo{
		Id:          web3AuthToken.Address,
		Username:    web3AuthToken.Address,
		DisplayName: web3AuthToken.Address,
		AvatarUrl:   fmt.Sprintf("metamask:%v", web3AuthToken.Address),
	}
	return userInfo, nil
}

// verifyWeb3SIWE is the single SIWE verification helper shared by MetaMask
// and Web3Onboard. It parses the SIWE message, has siwe-go verify the
// signature (ecrecover + compare against message.address) plus the bound
// domain, the server-issued nonce, and the message's own validity window.
// On success it returns an oauth2.Token carrying the extracted address.
func verifyWeb3SIWE(code string, expectedNonce string, expectedDomain string, walletType string) (*oauth2.Token, error) {
	if expectedNonce == "" || expectedDomain == "" {
		return nil, errors.New("web3 SIWE verification context missing (nonce or domain); the controller must populate idpInfo.Web3Expected*")
	}

	var payload siweCodePayload
	if err := json.Unmarshal([]byte(code), &payload); err != nil {
		return nil, fmt.Errorf("invalid SIWE payload: %w", err)
	}
	if payload.Message == "" || payload.Signature == "" {
		return nil, errors.New("SIWE payload must contain both message and signature")
	}

	msg, err := siwe.ParseMessage(payload.Message)
	if err != nil {
		return nil, fmt.Errorf("invalid SIWE message: %w", err)
	}

	now := time.Now()
	if _, err := msg.Verify(payload.Signature, &expectedDomain, &expectedNonce, &now); err != nil {
		return nil, fmt.Errorf("SIWE verification failed: %w", err)
	}

	address := msg.GetAddress().Hex()

	token := &oauth2.Token{
		AccessToken: fmt.Sprintf("%v:%v", Web3AuthTokenKey, address),
		TokenType:   "Bearer",
		Expiry:      time.Now().AddDate(0, 1, 0),
	}
	token = token.WithExtra(map[string]interface{}{
		Web3AuthTokenKey: Web3AuthToken{
			Address:    address,
			Nonce:      msg.GetNonce(),
			CreateAt:   uint64(now.Unix()),
			TypedData:  payload.Message,
			Signature:  payload.Signature,
			WalletType: walletType,
		},
	})
	return token, nil
}
