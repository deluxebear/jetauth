// Copyright 2022 The Casdoor Authors. All Rights Reserved.
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
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

type AlipayIdProvider struct {
	Client *http.Client
	Config *oauth2.Config
}

// NewAlipayIdProvider ...
func NewAlipayIdProvider(clientId string, clientSecret string, redirectUrl string) *AlipayIdProvider {
	idp := &AlipayIdProvider{}

	config := idp.getConfig(clientId, clientSecret, redirectUrl)
	idp.Config = config

	return idp
}

// SetHttpClient ...
func (idp *AlipayIdProvider) SetHttpClient(client *http.Client) {
	idp.Client = client
}

// getConfig return a point of Config, which describes a typical 3-legged OAuth2 flow
func (idp *AlipayIdProvider) getConfig(clientId string, clientSecret string, redirectUrl string) *oauth2.Config {
	endpoint := oauth2.Endpoint{
		AuthURL:  "https://openauth.alipay.com/oauth2/publicAppAuthorize.htm",
		TokenURL: "https://openapi.alipay.com/gateway.do",
	}

	config := &oauth2.Config{
		Scopes:       []string{"", ""},
		Endpoint:     endpoint,
		ClientID:     clientId,
		ClientSecret: clientSecret,
		RedirectURL:  redirectUrl,
	}

	return config
}

type AlipayAccessToken struct {
	Response AlipaySystemOauthTokenResponse `json:"alipay_system_oauth_token_response"`
	Sign     string                         `json:"sign"`
}

type AlipaySystemOauthTokenResponse struct {
	AccessToken  string `json:"access_token"`
	AlipayUserId string `json:"alipay_user_id"`
	ExpiresIn    int    `json:"expires_in"`
	ReExpiresIn  int    `json:"re_expires_in"`
	RefreshToken string `json:"refresh_token"`
	UserId       string `json:"user_id"`
}

// GetToken use code to get access_token
func (idp *AlipayIdProvider) GetToken(code string) (*oauth2.Token, error) {
	pTokenParams := &struct {
		ClientId  string `json:"app_id"`
		CharSet   string `json:"charset"`
		Code      string `json:"code"`
		GrantType string `json:"grant_type"`
		Method    string `json:"method"`
		SignType  string `json:"sign_type"`
		TimeStamp string `json:"timestamp"`
		Version   string `json:"version"`
	}{idp.Config.ClientID, "utf-8", code, "authorization_code", "alipay.system.oauth.token", "RSA2", time.Now().Format("2006-01-02 15:04:05"), "1.0"}

	data, err := idp.postWithBody(pTokenParams, idp.Config.Endpoint.TokenURL)
	if err != nil {
		return nil, err
	}

	pToken := &AlipayAccessToken{}
	err = json.Unmarshal(data, pToken)
	if err != nil {
		return nil, err
	}

	token := &oauth2.Token{
		AccessToken: pToken.Response.AccessToken,
		Expiry:      time.Unix(time.Now().Unix()+int64(pToken.Response.ExpiresIn), 0),
	}
	return token, nil
}

/*
{
    "alipay_user_info_share_response":{
        "code":"10000",
        "msg":"Success",
        "avatar":"https:\/\/tfs.alipayobjects.com\/images\/partner\/T1.QxFXk4aXXXXXXXX",
        "nick_name":"zhangsan",
        "user_id":"2099222233334444"
    },
    "sign":"m8rWJeqfoa5tDQRRVnPhRHcpX7NZEgjIPTPF1QBxos6XXXXXXXXXXXXXXXXXXXXXXXXXX"
}
*/

type AlipayUserResponse struct {
	AlipayUserInfoShareResponse AlipayUserInfoShareResponse `json:"alipay_user_info_share_response"`
	Sign                        string                      `json:"sign"`
}

type AlipayUserInfoShareResponse struct {
	Code     string `json:"code"`
	Msg      string `json:"msg"`
	Avatar   string `json:"avatar"`
	NickName string `json:"nick_name"`
	UserId   string `json:"user_id"`
}

// GetUserInfo Use access_token to get UserInfo
func (idp *AlipayIdProvider) GetUserInfo(token *oauth2.Token) (*UserInfo, error) {
	atUserInfo := &AlipayUserResponse{}
	accessToken := token.AccessToken

	pTokenParams := &struct {
		ClientId  string `json:"app_id"`
		CharSet   string `json:"charset"`
		AuthToken string `json:"auth_token"`
		Method    string `json:"method"`
		SignType  string `json:"sign_type"`
		TimeStamp string `json:"timestamp"`
		Version   string `json:"version"`
	}{idp.Config.ClientID, "utf-8", accessToken, "alipay.user.info.share", "RSA2", time.Now().Format("2006-01-02 15:04:05"), "1.0"}
	data, err := idp.postWithBody(pTokenParams, idp.Config.Endpoint.TokenURL)
	if err != nil {
		return nil, err
	}

	err = json.Unmarshal(data, atUserInfo)
	if err != nil {
		return nil, err
	}

	userInfo := UserInfo{
		Id:          atUserInfo.AlipayUserInfoShareResponse.UserId,
		Username:    atUserInfo.AlipayUserInfoShareResponse.NickName,
		DisplayName: atUserInfo.AlipayUserInfoShareResponse.NickName,
		AvatarUrl:   atUserInfo.AlipayUserInfoShareResponse.Avatar,
	}

	return &userInfo, nil
}

func (idp *AlipayIdProvider) postWithBody(body interface{}, targetUrl string) ([]byte, error) {
	bs, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	bodyJson := make(map[string]interface{})
	err = json.Unmarshal(bs, &bodyJson)
	if err != nil {
		return nil, err
	}

	formData := url.Values{}
	for k := range bodyJson {
		formData.Set(k, bodyJson[k].(string))
	}

	sign, err := rsaSignWithRSA256(getStringToSign(formData), idp.Config.ClientSecret)
	if err != nil {
		return nil, err
	}

	formData.Set("sign", sign)

	resp, err := idp.Client.Post(targetUrl, "application/x-www-form-urlencoded;charset=utf-8", strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, err
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	defer func(Body io.ReadCloser) {
		err := Body.Close()
		if err != nil {
			return
		}
	}(resp.Body)

	return data, nil
}

// get the string to sign, see https://opendocs.alipay.com/common/02kf5q
func getStringToSign(formData url.Values) string {
	keys := make([]string, 0, len(formData))
	for k := range formData {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	str := ""
	for _, k := range keys {
		if k == "sign" || formData[k][0] == "" {
			continue
		} else {
			str += "&" + k + "=" + formData[k][0]
		}
	}
	str = strings.Trim(str, "&")
	return str
}

// use privateKey to sign the content
func rsaSignWithRSA256(signContent string, privateKey string) (string, error) {
	privateKey = formatPrivateKey(privateKey)
	block, _ := pem.Decode([]byte(privateKey))
	if block == nil {
		return "", errors.New("alipay: failed to PEM-decode the Client Secret — expected a PKCS#8 RSA private key (header `-----BEGIN PRIVATE KEY-----`). Paste either the whole .pem file or just its base64 body, no stray whitespace")
	}

	h := sha256.New()
	h.Write([]byte(signContent))
	hashed := h.Sum(nil)

	privateKeyPKCS8, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return "", fmt.Errorf("alipay: PKCS#8 parse failed — if you pasted a PKCS#1 key (header `-----BEGIN RSA PRIVATE KEY-----`) convert it first with `openssl pkcs8 -topk8 -in old.pem -out new.pem -nocrypt`: %w", err)
	}
	privateKeyRSA, ok := privateKeyPKCS8.(*rsa.PrivateKey)
	if !ok {
		return "", errors.New("alipay: parsed key is not RSA — Alipay requires RSA2 (2048-bit RSA)")
	}

	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKeyRSA, crypto.SHA256, hashed)
	if err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(signature), nil
}

// formatPrivateKey normalises whatever the admin pasted into Client Secret
// into a well-formed PEM block. Accepts:
//   - full PKCS#8 PEM (header + base64 body + footer, any surrounding whitespace)
//   - full PKCS#1 PEM (RSA PRIVATE KEY) — passed through; parse step will reject
//     with an actionable message pointing at `openssl pkcs8 -topk8`
//   - raw base64 body (no header/footer) — wrapped as PKCS#8
//
// A prior bug: the prefix check ran on the untrimmed string, so a leading
// space / newline / BOM caused it to fall into the strip branch, which then
// mangled the `-----BEGIN PRIVATE KEY-----` header itself (stripping the
// internal spaces), producing a garbage PEM that pem.Decode choked on and
// the caller panicked.
// pemWhitespaceStripper removes every whitespace / control char that can
// legally appear between PEM markers or inside a base64 body. Keeping this
// broader than strings.TrimSpace matters because some admin UIs collapse the
// pasted PEM into a single line with spaces between the header, body, and
// footer — pem.Decode rejects those, but the bytes are recoverable.
func stripPEMWhitespace(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, ch := range s {
		if ch == '\n' || ch == '\r' || ch == ' ' || ch == '\t' || ch == '\v' || ch == '\f' {
			continue
		}
		b.WriteRune(ch)
	}
	return b.String()
}

// wrapPEM rebuilds a canonical PEM block: `-----BEGIN <type>-----\n`, body
// chunked at 64 chars per line, `-----END <type>-----`.
func wrapPEM(keyType, body string) string {
	var b strings.Builder
	b.WriteString("-----BEGIN ")
	b.WriteString(keyType)
	b.WriteString("-----\n")
	for i := 0; i < len(body); i += 64 {
		end := i + 64
		if end > len(body) {
			end = len(body)
		}
		b.WriteString(body[i:end])
		b.WriteString("\n")
	}
	b.WriteString("-----END ")
	b.WriteString(keyType)
	b.WriteString("-----")
	return b.String()
}

// formatPrivateKey accepts whatever the admin pasted into Client Secret and
// emits a pem.Decode-friendly PKCS-style PEM block. Handles:
//   - canonical multi-line PEM (identity)
//   - single-line PEM where the admin form collapsed newlines to spaces
//     (observed with beego's default single-line input + some browser autofills)
//   - raw base64 body (no header / footer) — wrapped as PKCS#8
//   - PKCS#1 (`RSA PRIVATE KEY`) — preserved; parse step surfaces a targeted
//     "convert with openssl pkcs8 -topk8" message
//   - wrong key type (PUBLIC KEY / CERTIFICATE) — preserved so the parse
//     step errors out cleanly instead of silently becoming a PRIVATE KEY
//   - stray UTF-8 BOM at start (common when pasted through Windows tools)
func formatPrivateKey(privateKey string) string {
	privateKey = strings.TrimPrefix(privateKey, "\ufeff")
	privateKey = strings.TrimSpace(privateKey)

	// PEM-shaped input. Extract key type + body, rebuild cleanly. Handles
	// the "single line with spaces" case by stripping all whitespace from
	// between the BEGIN and END markers.
	if strings.HasPrefix(privateKey, "-----BEGIN ") {
		afterBegin := privateKey[len("-----BEGIN "):]
		typeEnd := strings.Index(afterBegin, "-----")
		if typeEnd > 0 {
			keyType := strings.TrimSpace(afterBegin[:typeEnd])
			endMarker := "-----END " + keyType + "-----"
			// The body lives between the closing dashes of BEGIN and the
			// opening dashes of END. Accept whitespace between "TYPE" and
			// the trailing "-----" (some tools emit "BEGIN PRIVATE KEY -----").
			bodyStart := strings.Index(privateKey, "-----") + len("-----")
			bodyStart = strings.Index(privateKey[bodyStart:], "-----") + bodyStart + len("-----")
			endIdx := strings.Index(privateKey, endMarker)
			if endIdx > bodyStart {
				body := stripPEMWhitespace(privateKey[bodyStart:endIdx])
				return wrapPEM(keyType, body)
			}
		}
		// Malformed — let pem.Decode surface the native error.
		return privateKey
	}

	// Raw base64 body. Strip whitespace, wrap as PKCS#8.
	return wrapPEM("PRIVATE KEY", stripPEMWhitespace(privateKey))
}
