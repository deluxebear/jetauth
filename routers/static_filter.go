// Copyright 2021 The Casdoor Authors. All Rights Reserved.
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

package routers

import (
	"bytes"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/beego/beego/v2/server/web/context"
	"github.com/deluxebear/casdoor/conf"
	"github.com/deluxebear/casdoor/embedded"
	"github.com/deluxebear/casdoor/object"
	"github.com/deluxebear/casdoor/util"
)

var (
	oldStaticBaseUrl = "https://cdn.casbin.org"
	newStaticBaseUrl = conf.GetConfigString("staticBaseUrl")
	enableGzip       = conf.GetConfigBool("enableGzip")
	frontendBaseDir  = conf.GetConfigString("frontendBaseDir")
)

func webFileExist(fullPath string) bool {
	if embedded.WebFS != nil {
		relPath := strings.TrimPrefix(fullPath, "web/build/")
		_, err := fs.Stat(embedded.WebFS, relPath)
		return err == nil
	}
	return util.FileExist(fullPath)
}

func serveEmbeddedSwagger(ctx *context.Context, urlPath string) {
	relPath := strings.TrimPrefix(urlPath, "/swagger")
	relPath = strings.TrimPrefix(relPath, "/")
	if relPath == "" {
		relPath = "index.html"
	}

	data, err := fs.ReadFile(embedded.SwaggerFS, relPath)
	if err != nil {
		ctx.ResponseWriter.WriteHeader(http.StatusNotFound)
		return
	}

	info, _ := fs.Stat(embedded.SwaggerFS, relPath)
	http.ServeContent(ctx.ResponseWriter, ctx.Request, info.Name(), info.ModTime(), bytes.NewReader(data))
}

func getWebBuildFolder() string {
	if embedded.WebFS != nil {
		return "web/build"
	}

	path := "web/build"
	if util.FileExist(filepath.Join(path, "index.html")) || frontendBaseDir == "" {
		return path
	}

	if util.FileExist(filepath.Join(frontendBaseDir, "index.html")) {
		return frontendBaseDir
	}

	path = filepath.Join(frontendBaseDir, "web/build")
	return path
}

func fastAutoSignin(ctx *context.Context) (string, error) {
	userId := getSessionUser(ctx)
	if userId == "" {
		return "", nil
	}

	clientId := ctx.Input.Query("client_id")
	responseType := ctx.Input.Query("response_type")
	redirectUri := ctx.Input.Query("redirect_uri")
	scope := ctx.Input.Query("scope")
	state := ctx.Input.Query("state")
	nonce := ctx.Input.Query("nonce")
	codeChallenge := ctx.Input.Query("code_challenge")
	if clientId == "" || responseType != "code" || redirectUri == "" {
		return "", nil
	}

	application, err := object.GetApplicationByClientId(clientId)
	if err != nil {
		return "", err
	}
	if application == nil {
		return "", nil
	}

	if !application.EnableAutoSignin {
		return "", nil
	}

	isAllowed, err := object.CheckLoginPermission(userId, application)
	if err != nil {
		return "", err
	}

	if !isAllowed {
		return "", nil
	}

	user, err := object.GetUser(userId)
	if err != nil {
		return "", err
	}
	if user == nil {
		return "", nil
	}

	consentRequired, err := object.CheckConsentRequired(user, application, scope)
	if err != nil {
		return "", err
	}

	if consentRequired {
		return "", nil
	}

	code, err := object.GetOAuthCode(userId, clientId, "", "autoSignin", responseType, redirectUri, scope, state, nonce, codeChallenge, "", ctx.Request.Host, getAcceptLanguage(ctx))
	if err != nil {
		return "", err
	} else if code.Message != "" {
		return "", errors.New(code.Message)
	}

	sep := "?"
	if strings.Contains(redirectUri, "?") {
		sep = "&"
	}
	res := fmt.Sprintf("%s%scode=%s&state=%s", redirectUri, sep, code.Code, state)
	return res, nil
}

func StaticFilter(ctx *context.Context) {
	urlPath := ctx.Request.URL.Path

	if urlPath == "/.well-known/acme-challenge/filename" {
		http.ServeContent(ctx.ResponseWriter, ctx.Request, "acme-challenge", time.Now(), strings.NewReader("content"))
	}

	if strings.HasPrefix(urlPath, "/api/") || strings.HasPrefix(urlPath, "/.well-known/") {
		return
	}
	if strings.HasPrefix(urlPath, "/swagger") && embedded.SwaggerFS != nil {
		serveEmbeddedSwagger(ctx, urlPath)
		return
	}
	if serveAuthCallbackHandlerScript(ctx) {
		return
	}
	if serveProviderHintRedirectScript(ctx) {
		return
	}
	if strings.HasPrefix(urlPath, "/cas") && (strings.HasSuffix(urlPath, "/serviceValidate") || strings.HasSuffix(urlPath, "/proxy") || strings.HasSuffix(urlPath, "/proxyValidate") || strings.HasSuffix(urlPath, "/validate") || strings.HasSuffix(urlPath, "/p3/serviceValidate") || strings.HasSuffix(urlPath, "/p3/proxyValidate") || strings.HasSuffix(urlPath, "/samlValidate")) {
		return
	}
	if strings.HasPrefix(urlPath, "/scim") {
		return
	}

	if urlPath == "/login/oauth/authorize" {
		redirectUrl, err := fastAutoSignin(ctx)
		if err != nil {
			responseError(ctx, err.Error())
			return
		}

		if redirectUrl != "" {
			http.Redirect(ctx.ResponseWriter, ctx.Request, redirectUrl, http.StatusFound)
			return
		}

		if serveProviderHintRedirectPage(ctx) {
			return
		}
	}

	if serveAuthCallbackPage(ctx) {
		return
	}

	webBuildFolder := getWebBuildFolder()
	path := webBuildFolder
	if urlPath == "/" {
		path += "/index.html"
	} else {
		path += urlPath
	}

	// Preventing synchronization problems from concurrency
	ctx.Input.CruSession = nil

	organizationThemeCookie, err := appendThemeCookie(ctx, urlPath)
	if err != nil {
		fmt.Println(err)
	}

	if strings.Contains(path, "/../") || !webFileExist(path) {
		path = webBuildFolder + "/index.html"
	}
	if strings.HasSuffix(path, "/index.html") {
		err = util.AppendWebConfigCookie(ctx)
		if err != nil {
			logs.Error("AppendWebConfigCookie failed in StaticFilter, error: %s", err)
		}
	}
	if !webFileExist(path) {
		dir, err := os.Getwd()
		if err != nil {
			panic(err)
		}
		dir = strings.ReplaceAll(dir, "\\", "/")
		ctx.ResponseWriter.WriteHeader(http.StatusNotFound)
		errorText := fmt.Sprintf("The Casdoor frontend HTML file: \"index.html\" was not found, it should be placed at: \"%s/web/build/index.html\". For more information, see: https://casdoor.org/docs/basic/server-installation/#frontend-1", dir)
		http.ServeContent(ctx.ResponseWriter, ctx.Request, "Casdoor frontend has encountered error...", time.Now(), strings.NewReader(errorText))
		return
	}

	if oldStaticBaseUrl == newStaticBaseUrl {
		makeGzipResponse(ctx.ResponseWriter, ctx.Request, path, organizationThemeCookie)
	} else {
		serveFileWithReplace(ctx.ResponseWriter, ctx.Request, path, organizationThemeCookie)
	}
}

func serveFileWithReplace(w http.ResponseWriter, r *http.Request, name string, organizationThemeCookie *OrganizationThemeCookie) {
	var oldContent string
	var fileName string
	var modTime time.Time

	if embedded.WebFS != nil {
		relPath := strings.TrimPrefix(name, "web/build/")
		data, err := fs.ReadFile(embedded.WebFS, relPath)
		if err != nil {
			panic(err)
		}
		info, err := fs.Stat(embedded.WebFS, relPath)
		if err != nil {
			panic(err)
		}
		oldContent = string(data)
		fileName = info.Name()
		modTime = info.ModTime()
	} else {
		f, err := os.Open(filepath.Clean(name))
		if err != nil {
			panic(err)
		}
		defer f.Close()

		d, err := f.Stat()
		if err != nil {
			panic(err)
		}

		oldContent = util.ReadStringFromPath(name)
		fileName = d.Name()
		modTime = d.ModTime()
	}

	newContent := oldContent
	if organizationThemeCookie != nil {
		newContent = strings.ReplaceAll(newContent, "https://cdn.casbin.org/img/favicon.png", organizationThemeCookie.Favicon)
		newContent = strings.ReplaceAll(newContent, "<title>Casdoor</title>", fmt.Sprintf("<title>%s</title>", organizationThemeCookie.DisplayName))
	}

	newContent = strings.ReplaceAll(newContent, oldStaticBaseUrl, newStaticBaseUrl)

	http.ServeContent(w, r, fileName, modTime, strings.NewReader(newContent))
}

type gzipResponseWriter struct {
	io.Writer
	http.ResponseWriter
}

func (w gzipResponseWriter) Write(b []byte) (int, error) {
	return w.Writer.Write(b)
}

func makeGzipResponse(w http.ResponseWriter, r *http.Request, path string, organizationThemeCookie *OrganizationThemeCookie) {
	if !enableGzip || !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		serveFileWithReplace(w, r, path, organizationThemeCookie)
		return
	}
	w.Header().Set("Content-Encoding", "gzip")
	gz := gzip.NewWriter(w)
	defer gz.Close()
	gzw := gzipResponseWriter{Writer: gz, ResponseWriter: w}
	serveFileWithReplace(gzw, r, path, organizationThemeCookie)
}
