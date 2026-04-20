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
	"errors"
	"fmt"
	"net/http"
	"strings"

	"golang.org/x/oauth2"
)

const Web3AuthTokenKey = "web3AuthToken"

// Web3AuthToken is what we stash inside the oauth2.Token Extra for downstream
// GetUserInfo. After the SIWE migration, every field here is populated from a
// signature-verified SIWE message — not client-supplied.
type Web3AuthToken struct {
	Address    string `json:"address"`
	Nonce      string `json:"nonce"`
	CreateAt   uint64 `json:"createAt"`
	TypedData  string `json:"typedData"`
	Signature  string `json:"signature"`
	WalletType string `json:"walletType"`
}

type Web3OnboardIdProvider struct {
	Client         *http.Client
	ExpectedNonce  string
	ExpectedDomain string
}

func NewWeb3OnboardIdProvider(expectedNonce string, expectedDomain string) *Web3OnboardIdProvider {
	return &Web3OnboardIdProvider{
		ExpectedNonce:  expectedNonce,
		ExpectedDomain: expectedDomain,
	}
}

func (idp *Web3OnboardIdProvider) SetHttpClient(client *http.Client) {
	idp.Client = client
}

func (idp *Web3OnboardIdProvider) GetToken(code string) (*oauth2.Token, error) {
	return verifyWeb3SIWE(code, idp.ExpectedNonce, idp.ExpectedDomain, "Web3Onboard")
}

func (idp *Web3OnboardIdProvider) GetUserInfo(token *oauth2.Token) (*UserInfo, error) {
	web3AuthToken, ok := token.Extra(Web3AuthTokenKey).(Web3AuthToken)
	if !ok {
		return nil, errors.New("invalid web3AuthToken")
	}

	fmtAddress := fmt.Sprintf("%v_%v",
		strings.ReplaceAll(strings.TrimSpace(web3AuthToken.WalletType), " ", "_"),
		web3AuthToken.Address,
	)
	userInfo := &UserInfo{
		Id:          fmtAddress,
		Username:    fmtAddress,
		DisplayName: fmtAddress,
		AvatarUrl:   fmt.Sprintf("web3onboard:%v", web3AuthToken.Address),
	}
	return userInfo, nil
}
