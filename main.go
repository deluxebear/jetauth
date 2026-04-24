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

package main

import (
	"encoding/json"
	"fmt"

	"github.com/beego/beego/v2/core/logs"
	"github.com/beego/beego/v2/server/web"
	_ "github.com/beego/beego/v2/server/web/session/redis"
	"github.com/deluxebear/jetauth/authz"
	"github.com/deluxebear/jetauth/conf"
	"github.com/deluxebear/jetauth/controllers"
	"github.com/deluxebear/jetauth/embedded"
	"github.com/deluxebear/jetauth/ldap"
	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/proxy"
	"github.com/deluxebear/jetauth/routers"
	"github.com/deluxebear/jetauth/service"
	"github.com/deluxebear/jetauth/util"
)

func main() {
	web.BConfig.WebConfig.Session.SessionOn = true
	web.BConfig.WebConfig.Session.SessionName = "jetauth_session_id"
	if conf.GetConfigString("redisEndpoint") == "" {
		web.BConfig.WebConfig.Session.SessionProvider = "file"
		web.BConfig.WebConfig.Session.SessionProviderConfig = "./tmp"
	} else {
		web.BConfig.WebConfig.Session.SessionProvider = "redis"
		web.BConfig.WebConfig.Session.SessionProviderConfig = conf.GetConfigString("redisEndpoint")
	}
	web.BConfig.WebConfig.Session.SessionCookieLifeTime = 3600 * 24 * 30
	web.BConfig.WebConfig.Session.SessionGCMaxLifetime = 3600 * 24 * 30
	// web.BConfig.WebConfig.Session.SessionCookieSameSite = http.SameSiteNoneMode

	routers.InitAPI()
	object.InitFlag()
	object.InitAdapter()
	object.CreateTables()

	object.InitDb()
	object.InitCustomHttpEmailMigration()
	object.InitBizReBACCache()

	// Handle export command
	if object.ShouldExportData() {
		exportPath := object.GetExportFilePath()
		err := object.DumpToFile(exportPath)
		if err != nil {
			panic(fmt.Sprintf("Error exporting data to %s: %v", exportPath, err))
		}
		fmt.Printf("Data exported successfully to %s\n", exportPath)
		return
	}

	object.InitDefaultStorageProvider()
	object.InitLogProviders()
	object.InitLdapAutoSynchronizer()
	proxy.InitHttpClient()
	authz.InitApi()
	object.InitUserManager()
	object.InitFromFile()
	object.InitCleanupTokens()

	object.InitSiteMap()
	if len(object.SiteMap) != 0 {
		object.InitRuleMap()
		object.StartMonitorSitesLoop()
	}

	util.SafeGoroutine(func() { object.RunSyncUsersJob() })
	util.SafeGoroutine(func() { controllers.InitCLIDownloader() })

	// web.DelStaticPath("/static")

	web.BConfig.WebConfig.DirectoryIndex = true
	// Strip the beego version leak from the default Server header. The
	// framework identity and version are not useful to legitimate clients
	// and help attackers fingerprint vulnerable endpoints.
	web.BConfig.ServerName = ""
	swaggerDir := "swagger"
	if !util.FileExist(swaggerDir) && embedded.SwaggerDir != "" {
		swaggerDir = embedded.SwaggerDir
	}
	web.SetStaticPath("/swagger", swaggerDir)
	web.SetStaticPath("/files", "files")
	// Replace beego's default "Not Found / Powered by beego" page so we
	// don't leak the framework version and so /api/* clients get JSON
	// instead of HTML when a route misses.
	web.ErrorHandler("404", routers.Handle404)
	// https://studygolang.com/articles/2303
	web.InsertFilter("*", web.BeforeStatic, routers.RequestBodyFilter)
	web.InsertFilter("*", web.BeforeRouter, routers.StaticFilter)
	web.InsertFilter("*", web.BeforeRouter, routers.AutoSigninFilter)
	web.InsertFilter("*", web.BeforeRouter, routers.CorsFilter)
	web.InsertFilter("*", web.BeforeRouter, routers.TimeoutFilter)
	web.InsertFilter("*", web.BeforeRouter, routers.ApiFilter)
	web.InsertFilter("*", web.BeforeRouter, routers.PrometheusFilter)
	web.InsertFilter("*", web.BeforeRouter, routers.RecordMessage)
	web.InsertFilter("*", web.BeforeRouter, routers.FieldValidationFilter)
	web.InsertFilter("*", web.AfterExec, routers.AfterRecordMessage, web.WithReturnOnOutput(false))

	var logAdapter string
	logConfigMap := make(map[string]interface{})
	err := json.Unmarshal([]byte(conf.GetConfigString("logConfig")), &logConfigMap)
	if err != nil {
		panic(err)
	}
	_, ok := logConfigMap["adapter"]
	if !ok {
		logAdapter = "file"
	} else {
		logAdapter = logConfigMap["adapter"].(string)
	}
	if logAdapter == "console" {
		logs.Reset()
	}
	err = logs.SetLogger(logAdapter, conf.GetConfigString("logConfig"))
	if err != nil {
		panic(err)
	}

	port := web.AppConfig.DefaultInt("httpport", 8000)
	// logs.SetLevel(logs.LevelInformational)
	logs.SetLogFuncCall(false)

	err = util.StopOldInstance(port)
	if err != nil {
		panic(err)
	}

	go ldap.StartLdapServer()
	go object.ClearThroughputPerSecond()

	// Start webhook delivery worker
	object.StartWebhookDeliveryWorker()

	if len(object.SiteMap) != 0 {
		service.Start()
	}

	web.Run(fmt.Sprintf(":%v", port))
}
